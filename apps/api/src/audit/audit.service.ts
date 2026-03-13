import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  AuditEventType,
  Severity,
  AuditEntry,
} from '@gepetto-shield/shared';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);
  private lastHash: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // Load the last entry's hash to continue the chain
    const lastEntry = await this.prisma.auditEvent.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { hash: true },
    });
    if (lastEntry) {
      this.lastHash = lastEntry.hash;
      this.logger.log(
        `Audit chain initialized — last hash: ${this.lastHash.slice(0, 16)}...`,
      );
    } else {
      this.logger.log('Audit chain initialized — empty (genesis)');
    }
  }

  /**
   * Log an audit event with hash-chained integrity.
   * Each event's hash depends on its content + the previous event's hash,
   * creating a blockchain-style tamper-detection chain.
   */
  async log(entry: Partial<AuditEntry>): Promise<AuditEntry> {
    const id = entry.id ?? randomUUID();
    const createdAt = entry.createdAt ?? new Date();
    const prevHash = this.lastHash ?? 'GENESIS';

    const record = {
      id,
      userId: entry.userId ?? null,
      eventType: entry.eventType ?? AuditEventType.QUERY_SUBMITTED,
      severity: entry.severity ?? Severity.INFO,
      queryHash: entry.queryHash ?? null,
      responseHash: entry.responseHash ?? null,
      intent: entry.intent ?? null,
      jailbreakScore: entry.jailbreakScore ?? null,
      piiDetected: entry.piiDetected ?? false,
      canaryCheck: entry.canaryCheck ?? false,
      latencyMs: entry.latencyMs ?? null,
      tokensIn: entry.tokensIn ?? null,
      tokensOut: entry.tokensOut ?? null,
      prevHash,
      hash: '', // computed below
      metadata: entry.metadata ?? null,
      createdAt,
    };

    record.hash = this.computeHash(record);
    this.lastHash = record.hash;

    const stored = await this.prisma.auditEvent.create({
      data: {
        id: record.id,
        userId: record.userId,
        eventType: record.eventType,
        severity: record.severity,
        queryHash: record.queryHash,
        responseHash: record.responseHash,
        intent: record.intent,
        jailbreakScore: record.jailbreakScore,
        piiDetected: record.piiDetected,
        canaryCheck: record.canaryCheck,
        latencyMs: record.latencyMs,
        tokensIn: record.tokensIn,
        tokensOut: record.tokensOut,
        prevHash: record.prevHash,
        hash: record.hash,
        metadata: record.metadata as any,
        createdAt: record.createdAt,
      },
    });

    return {
      id: stored.id,
      userId: stored.userId ?? undefined,
      eventType: stored.eventType as AuditEventType,
      severity: stored.severity as Severity,
      queryHash: stored.queryHash ?? undefined,
      responseHash: stored.responseHash ?? undefined,
      intent: stored.intent ?? undefined,
      jailbreakScore: stored.jailbreakScore ?? undefined,
      piiDetected: stored.piiDetected,
      canaryCheck: stored.canaryCheck,
      latencyMs: stored.latencyMs ?? undefined,
      tokensIn: stored.tokensIn ?? undefined,
      tokensOut: stored.tokensOut ?? undefined,
      prevHash: stored.prevHash ?? undefined,
      hash: stored.hash,
      metadata: (stored.metadata as Record<string, unknown>) ?? undefined,
      createdAt: stored.createdAt,
    };
  }

  /**
   * Verify the integrity of the audit hash chain.
   * Recomputes each entry's hash and checks it matches stored + prevHash links.
   */
  async verifyChain(opts?: {
    userId?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ valid: boolean; brokenAt?: string; totalChecked: number }> {
    const where: Record<string, unknown> = {};
    if (opts?.userId) where.userId = opts.userId;
    if (opts?.from || opts?.to) {
      where.createdAt = {};
      if (opts?.from) (where.createdAt as any).gte = opts.from;
      if (opts?.to) (where.createdAt as any).lte = opts.to;
    }

    const entries = await this.prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    let expectedPrevHash: string | null = null;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Verify prevHash chain linkage (skip for first entry in filtered set)
      if (i === 0) {
        // First entry in our query — its prevHash should match whatever came before
        // We trust it as the start of our verification window
        expectedPrevHash = entry.hash;
      } else {
        // prevHash must match the previous entry's hash
        if (entry.prevHash !== expectedPrevHash) {
          this.logger.warn(
            `Audit chain broken at entry ${entry.id}: prevHash mismatch`,
          );
          return {
            valid: false,
            brokenAt: entry.id,
            totalChecked: i + 1,
          };
        }
      }

      // Recompute hash and verify
      const recomputed = this.computeHash({
        id: entry.id,
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
        prevHash: entry.prevHash,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
      });

      if (recomputed !== entry.hash) {
        this.logger.warn(
          `Audit chain broken at entry ${entry.id}: hash mismatch (stored=${entry.hash.slice(0, 16)}, computed=${recomputed.slice(0, 16)})`,
        );
        return {
          valid: false,
          brokenAt: entry.id,
          totalChecked: i + 1,
        };
      }

      expectedPrevHash = entry.hash;
    }

    return { valid: true, totalChecked: entries.length };
  }

  /**
   * Compute SHA-256 hash over the deterministic fields of an audit entry.
   * The hash covers all content fields + prevHash to create the chain.
   */
  private computeHash(entry: Record<string, unknown>): string {
    const payload = JSON.stringify({
      id: entry.id,
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
      prevHash: entry.prevHash,
      metadata: entry.metadata,
      createdAt:
        entry.createdAt instanceof Date
          ? entry.createdAt.toISOString()
          : entry.createdAt,
    });

    return createHash('sha256').update(payload).digest('hex');
  }
}
