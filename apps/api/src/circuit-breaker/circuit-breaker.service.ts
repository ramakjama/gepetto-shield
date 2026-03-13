import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis.service';

export type SecurityEventType =
  | 'jailbreak'
  | 'rate_limit'
  | 'cross_tenant'
  | 'canary_breach'
  | 'failed_login';

interface ThresholdConfig {
  /** Max events allowed within window before triggering lock. */
  max: number;
  /** Sliding window in seconds. */
  windowSec: number;
  /** Lock duration in ms. 0 = effectively permanent (30 days). */
  lockDurationMs: number;
}

const THRESHOLDS: Record<SecurityEventType, ThresholdConfig> = {
  jailbreak: { max: 3, windowSec: 600, lockDurationMs: 3_600_000 },
  rate_limit: { max: 5, windowSec: 300, lockDurationMs: 1_800_000 },
  cross_tenant: { max: 1, windowSec: 1, lockDurationMs: 0 },
  canary_breach: { max: 1, windowSec: 1, lockDurationMs: 0 },
  failed_login: { max: 10, windowSec: 86_400, lockDurationMs: 86_400_000 },
};

/** 30 days in milliseconds — used as "permanent" lock duration. */
const PERMANENT_LOCK_MS = 30 * 24 * 60 * 60 * 1000;

interface LockPayload {
  reason: string;
  lockedAt: string;
  unlocksAt: string | 'permanent';
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Record a security event for a user and check if threshold is breached.
   * If breached, automatically locks the user account.
   */
  async record(
    userId: string,
    eventType: SecurityEventType,
  ): Promise<{ locked: boolean; reason?: string }> {
    const config = THRESHOLDS[eventType];
    const key = `cb:events:${userId}:${eventType}`;
    const now = Date.now();
    const windowStart = now - config.windowSec * 1000;

    // Add event to sorted set (score = timestamp)
    await this.redis.client.zadd(key, now, `${now}:${Math.random()}`);

    // Remove events outside the sliding window
    await this.redis.client.zremrangebyscore(key, '-inf', windowStart);

    // Set TTL on the key to auto-cleanup
    await this.redis.client.expire(key, config.windowSec + 60);

    // Count events in window
    const count = await this.redis.client.zcard(key);

    if (count >= config.max) {
      const durationMs =
        config.lockDurationMs > 0
          ? config.lockDurationMs
          : PERMANENT_LOCK_MS;

      const reason = `Circuit breaker: ${count} ${eventType} events in ${config.windowSec}s (threshold: ${config.max})`;

      await this.lock(userId, reason, durationMs);

      this.logger.warn(
        `Account locked: userId=${userId} reason="${reason}"`,
      );

      return { locked: true, reason };
    }

    return { locked: false };
  }

  /**
   * Check if a user account is currently locked.
   */
  async isLocked(
    userId: string,
  ): Promise<{ locked: boolean; reason?: string; unlocksAt?: Date }> {
    const key = `cb:lock:${userId}`;
    const raw = await this.redis.client.get(key);

    if (!raw) {
      return { locked: false };
    }

    const payload: LockPayload = JSON.parse(raw);

    // Check if lock has expired (belt-and-suspenders — Redis TTL handles this too)
    if (payload.unlocksAt !== 'permanent') {
      const unlocksAt = new Date(payload.unlocksAt);
      if (unlocksAt <= new Date()) {
        await this.redis.client.del(key);
        return { locked: false };
      }
      return { locked: true, reason: payload.reason, unlocksAt };
    }

    return { locked: true, reason: payload.reason };
  }

  /**
   * Manually lock a user account.
   * @param durationMs Lock duration. 0 = 30 days (effectively permanent).
   */
  async lock(
    userId: string,
    reason: string,
    durationMs: number,
  ): Promise<void> {
    const key = `cb:lock:${userId}`;
    const effectiveDuration = durationMs > 0 ? durationMs : PERMANENT_LOCK_MS;
    const now = new Date();
    const unlocksAt = new Date(now.getTime() + effectiveDuration);

    const payload: LockPayload = {
      reason,
      lockedAt: now.toISOString(),
      unlocksAt:
        durationMs === 0 ? 'permanent' : unlocksAt.toISOString(),
    };

    const ttlSec = Math.ceil(effectiveDuration / 1000);
    await this.redis.client.set(
      key,
      JSON.stringify(payload),
      'EX',
      ttlSec,
    );

    this.logger.warn(
      `Account locked: userId=${userId} duration=${ttlSec}s reason="${reason}"`,
    );
  }

  /**
   * Manually unlock a user account (admin only).
   * Removes the lock and all event counters.
   */
  async unlock(userId: string): Promise<void> {
    const lockKey = `cb:lock:${userId}`;
    await this.redis.client.del(lockKey);

    // Also clear all event counters for this user
    const eventTypes: SecurityEventType[] = [
      'jailbreak',
      'rate_limit',
      'cross_tenant',
      'canary_breach',
      'failed_login',
    ];
    const eventKeys = eventTypes.map(
      (type) => `cb:events:${userId}:${type}`,
    );
    if (eventKeys.length > 0) {
      await this.redis.client.del(...eventKeys);
    }

    this.logger.log(`Account unlocked: userId=${userId}`);
  }
}
