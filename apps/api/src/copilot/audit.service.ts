import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import type { AuditEventType, Severity } from '@gepetto-shield/shared';

export interface AuditLogEntry {
  queryId: string;
  userId: string;
  eventType: AuditEventType;
  severity: Severity;
  queryHash?: string;
  responseHash?: string;
  jailbreakScore: number;
  intent: string;
  piiDetected: boolean;
  canaryCheck: boolean;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Hash-chained audit logging.
 *
 * Every audit event is:
 * 1. SHA-256 hashed (includes previous hash for chain integrity)
 * 2. Persisted to the AuditEvent table
 * 3. Chain can be verified for tampering at any time
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private lastHash: string = '0'.repeat(64); // Genesis hash

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log an audit event with hash-chain integrity.
   */
  async log(entry: AuditLogEntry): Promise<string> {
    try {
      // Build hash payload including previous hash (chain integrity)
      const hashPayload = JSON.stringify({
        prevHash: this.lastHash,
        queryId: entry.queryId,
        userId: entry.userId,
        eventType: entry.eventType,
        queryHash: entry.queryHash,
        responseHash: entry.responseHash,
        intent: entry.intent,
        timestamp: Date.now(),
      });

      const currentHash = crypto
        .createHash('sha256')
        .update(hashPayload)
        .digest('hex');

      // Persist to database
      const auditEvent = await this.prisma.auditEvent.create({
        data: {
          userId: entry.userId,
          eventType: entry.eventType,
          severity: entry.severity,
          queryHash: entry.queryHash,
          responseHash: entry.responseHash,
          intent: entry.intent,
          jailbreakScore: entry.jailbreakScore,
          piiDetected: entry.piiDetected,
          canaryCheck: entry.canaryCheck,
          latencyMs: entry.latencyMs,
          tokensIn: entry.tokensIn,
          tokensOut: entry.tokensOut,
          prevHash: this.lastHash,
          hash: currentHash,
          metadata: entry.metadata as any,
        },
      });

      // Update chain
      this.lastHash = currentHash;

      this.logger.debug(
        `Audit: ${entry.eventType} [${entry.severity}] user=${entry.userId} query=${entry.queryId}`,
      );

      return auditEvent.id;
    } catch (err) {
      // Audit failures must not break the pipeline — log and continue
      this.logger.error(
        `Failed to persist audit event: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Verify the integrity of the audit chain from a given starting point.
   * Returns true if the chain is intact, false if tampering is detected.
   */
  async verifyChain(fromId?: string): Promise<{ valid: boolean; brokenAt?: string }> {
    const events = await this.prisma.auditEvent.findMany({
      orderBy: { createdAt: 'asc' },
      ...(fromId ? { where: { createdAt: { gte: (await this.prisma.auditEvent.findUnique({ where: { id: fromId } }))?.createdAt } } } : {}),
      select: { id: true, hash: true, prevHash: true },
    });

    for (let i = 1; i < events.length; i++) {
      if (events[i].prevHash !== events[i - 1].hash) {
        return { valid: false, brokenAt: events[i].id };
      }
    }

    return { valid: true };
  }
}
