import { Injectable, Logger } from '@nestjs/common';
import { JailbreakService } from '../guardrails/jailbreak.service';
import type { RagChunk } from '../rag/rag.service';

export interface SanitizedChunk {
  id: string;
  content: string;
  score: number;
  source: string;
  metadata: Record<string, any>;
}

/**
 * Capa 4 — Indirect Injection Defense for the Copilot pipeline.
 *
 * Three-layer protection before chunks enter the LLM context:
 * 1. Re-scan each chunk through the 4-level jailbreak classifier
 *    (catches indirect injection via poisoned data fields)
 * 2. Verify chunk owner_id matches the requesting tenant
 *    (prevents cross-tenant data leaks at application layer)
 * 3. Strip dangerous patterns and wrap safe chunks in
 *    DATO_VERIFICADO delimiters for the LLM
 */
@Injectable()
export class CopilotChunkSanitizerService {
  private readonly logger = new Logger(CopilotChunkSanitizerService.name);

  constructor(private readonly jailbreakService: JailbreakService) {}

  /**
   * Sanitize an array of RAG chunks for safe inclusion in LLM context.
   *
   * @param chunks - Raw chunks from RagService.retrieve()
   * @param requestingTenantId - The orgId from the requesting user's JWT
   * @returns Array of verified, safe chunks wrapped in delimiters
   */
  async sanitize(
    chunks: RagChunk[],
    requestingTenantId: string,
  ): Promise<SanitizedChunk[]> {
    const safe: SanitizedChunk[] = [];

    for (const chunk of chunks) {
      // 1. Verify chunk ownership — tenant isolation at application level
      const chunkOwnerId = chunk.metadata?.owner_id;
      if (chunkOwnerId && chunkOwnerId !== requestingTenantId) {
        this.logger.warn(
          `Cross-tenant chunk blocked: chunk owner=${chunkOwnerId}, ` +
          `requester=${requestingTenantId}, chunk=${chunk.id}`,
        );
        continue;
      }

      // 2. Run full jailbreak classification on chunk content
      const jailbreakResult = this.jailbreakService.classify(chunk.content);
      if (jailbreakResult.blocked) {
        this.logger.warn(
          `Indirect injection detected in chunk ${chunk.id}: ` +
          `confidence=${jailbreakResult.confidence}, pattern=${jailbreakResult.pattern}, ` +
          `level=${jailbreakResult.level}`,
        );
        continue;
      }

      // 3. Strip residual dangerous patterns from content
      const cleanContent = this.stripDangerousPatterns(chunk.content);

      // 4. Wrap in verified delimiters
      safe.push({
        id: chunk.id,
        content: `\u00abDATO_VERIFICADO\u00bb ${cleanContent} \u00abDATO_VERIFICADO\u00bb`,
        score: chunk.score,
        source: chunk.source,
        metadata: chunk.metadata,
      });
    }

    this.logger.debug(
      `Chunk sanitization: ${chunks.length} in, ${safe.length} safe`,
    );

    return safe;
  }

  /**
   * Strip dangerous patterns that could be used for indirect injection,
   * even if they passed the jailbreak classifier (defense in depth).
   */
  private stripDangerousPatterns(content: string): string {
    let text = content;

    // Strip invisible Unicode characters (zero-width, bidi overrides, etc.)
    text = text.replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFE00-\uFE0F\uFEFF\uFFF0-\uFFF8]/g,
      '',
    );

    // Strip HTML/script tags
    text = text.replace(/<[^>]*>/g, '');

    // Neutralize markdown injection attempts
    text = text.replace(/\]\]\s*\[\[/g, '] [');

    // Strip javascript: URIs
    text = text.replace(/javascript:/gi, '[blocked]');

    // Strip event handler attributes
    text = text.replace(/on(error|load|click|mouseover)\s*=/gi, '[blocked]=');

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }
}
