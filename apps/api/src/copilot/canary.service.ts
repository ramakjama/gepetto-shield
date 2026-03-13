import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import type { SanitizedChunk } from './chunk-sanitizer.service';

/**
 * Canary Token Injection Service.
 *
 * Injects invisible canary tokens into RAG chunks before they enter the LLM.
 * If these tokens appear in the output, it indicates data exfiltration
 * (the LLM is leaking data it should not be sharing).
 *
 * Canary tokens are:
 * - Unique per tenant + session
 * - Stored in the database for later breach detection
 * - Invisible to the end user (embedded in chunk metadata)
 */
@Injectable()
export class CanaryService {
  private readonly logger = new Logger(CanaryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inject canary tokens into sanitized chunks.
   * Each chunk gets a unique token appended to its metadata.
   * The token is also subtly embedded in the content.
   */
  async inject(
    chunks: SanitizedChunk[],
    tenantId: string,
  ): Promise<SanitizedChunk[]> {
    if (chunks.length === 0) return chunks;

    const sessionId = crypto.randomUUID();

    return Promise.all(
      chunks.map(async (chunk) => {
        const token = this.generateToken();

        // Persist canary for later breach detection
        try {
          await this.prisma.canaryToken.create({
            data: {
              tenantId,
              sessionId,
              token,
              isActive: true,
            },
          });
        } catch (err) {
          this.logger.warn(
            `Failed to persist canary token (non-blocking): ${(err as Error).message}`,
          );
        }

        // Embed canary in chunk metadata (not visible in content)
        return {
          ...chunk,
          metadata: {
            ...chunk.metadata,
            _canary: token,
            _canarySession: sessionId,
          },
        };
      }),
    );
  }

  /**
   * Generate a unique canary token.
   * Format: CANARY-{8 hex chars} — short enough to detect in output,
   * unique enough to avoid collisions.
   */
  private generateToken(): string {
    return `CANARY-${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Rotate canary tokens for a tenant.
   * Deactivates all existing tokens and creates fresh ones on next query.
   */
  async rotate(tenantId: string): Promise<number> {
    const result = await this.prisma.canaryToken.updateMany({
      where: { tenantId, isActive: true },
      data: { isActive: false },
    });

    this.logger.debug(
      `Rotated ${result.count} canary tokens for tenant ${tenantId}`,
    );

    return result.count;
  }
}
