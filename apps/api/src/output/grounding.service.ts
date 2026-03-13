import { Injectable } from '@nestjs/common';
import type { RagChunk } from '../rag/rag.service';

interface GroundingResult {
  isGrounded: boolean;
  unverifiedEntities: string[];
  groundedPercentage: number;
}

/**
 * Verifies that LLM response entities are grounded in retrieved chunks.
 * Detects hallucinated data (names, numbers, NIFs) not present in sources.
 */
@Injectable()
export class GroundingService {
  // Patterns to extract verifiable entities from LLM response
  private readonly ENTITY_PATTERNS = [
    /\b\d{8}[A-Z]\b/g,                    // NIF
    /\b[XYZ]\d{7}[A-Z]\b/g,               // NIE
    /\bPOL-[\w-]+\b/g,                     // Policy numbers
    /\bSIN-[\w-]+\b/g,                     // Claim numbers
    /\b\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*€\b/g, // Euro amounts
    /\b(?:ES)?\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, // IBAN
  ];

  /**
   * Check if the LLM response is grounded in the retrieved chunks.
   */
  verify(response: string, chunks: RagChunk[]): GroundingResult {
    const allChunkContent = chunks.map((c) => c.content).join(' ');
    const entities = this.extractEntities(response);

    if (entities.length === 0) {
      return { isGrounded: true, unverifiedEntities: [], groundedPercentage: 100 };
    }

    const unverified = entities.filter(
      (entity) => !allChunkContent.includes(entity),
    );

    const groundedPercentage =
      ((entities.length - unverified.length) / entities.length) * 100;

    return {
      isGrounded: unverified.length === 0,
      unverifiedEntities: unverified,
      groundedPercentage: Math.round(groundedPercentage),
    };
  }

  /**
   * Mark unverified entities in the response text.
   */
  markUnverified(response: string, unverifiedEntities: string[]): string {
    let marked = response;
    for (const entity of unverifiedEntities) {
      marked = marked.replace(
        entity,
        `${entity} [DATO_NO_VERIFICADO]`,
      );
    }
    return marked;
  }

  private extractEntities(text: string): string[] {
    const entities: Set<string> = new Set();
    for (const pattern of this.ENTITY_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = re.exec(text)) !== null) {
        entities.add(match[0]);
      }
    }
    return [...entities];
  }
}
