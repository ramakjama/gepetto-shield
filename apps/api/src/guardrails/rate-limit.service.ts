import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@gepetto-shield/shared';
import { RedisService } from '../redis.service';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  total: number;
  retryAfterMs?: number;
}

const WINDOW_MS = 60_000;

const ROLE_LIMITS: Record<Role, number> = {
  [Role.AGENTE_EXCLUSIVO_TITULAR]: 20,
  [Role.AGENTE_EXCLUSIVO_EMPLEADO]: 20,
  [Role.CORREDOR]: 15,
  [Role.PERITO]: 10,
  [Role.REPARADOR]: 5,
  [Role.TALLER_AUTOPRESTO]: 5,
  [Role.ABOGADO_PREPERSA]: 10,
  [Role.EMPLEADO_SINIESTROS]: 25,
  [Role.EMPLEADO_COMERCIAL]: 25,
  [Role.EMPLEADO_SALUD]: 15,
  [Role.CLIENTE_PARTICULAR]: 8,
  [Role.CLIENTE_EMPRESA]: 12,
};

const DEFAULT_LIMIT = 5;

/**
 * Adaptive rate limiting using Redis sorted-set sliding window.
 *
 * Each request is stored as a timestamped member in a sorted set.
 * Old entries (outside window) are pruned on every check.
 * Suspicious users get dynamically reduced limits via adaptiveCheck.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Standard rate limit check based on user role.
   */
  async check(userId: string, role: Role): Promise<RateLimitResult> {
    const limit = ROLE_LIMITS[role] ?? DEFAULT_LIMIT;
    return this.slidingWindowCheck(userId, limit);
  }

  /**
   * Adaptive rate limit: reduces allowed rate for suspicious patterns.
   * - patternScore > 0.7 -> 2 req/min (near-certain jailbreak attempt)
   * - patternScore > 0.4 -> 5 req/min (suspicious activity)
   * - otherwise          -> normal role limit
   */
  async adaptiveCheck(
    userId: string,
    role: Role,
    patternScore: number,
  ): Promise<RateLimitResult> {
    let limit: number;

    if (patternScore > 0.7) {
      limit = 2;
    } else if (patternScore > 0.4) {
      limit = 5;
    } else {
      limit = ROLE_LIMITS[role] ?? DEFAULT_LIMIT;
    }

    return this.slidingWindowCheck(userId, limit);
  }

  /**
   * Sliding window rate limit using Redis sorted sets.
   * Atomic MULTI/EXEC: ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE
   */
  private async slidingWindowCheck(
    userId: string,
    limit: number,
  ): Promise<RateLimitResult> {
    const key = `guardrail:rate:${userId}`;
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    try {
      const results = await this.redis.client
        .multi()
        .zremrangebyscore(key, 0, windowStart)
        .zadd(key, now, member)
        .zcard(key)
        .expire(key, 120)
        .exec();

      if (!results) {
        this.logger.warn('Redis MULTI returned null — allowing request by default');
        return { allowed: true, remaining: limit, total: limit };
      }

      // results[2] = [err, count] from ZCARD
      const countResult = results[2];
      if (countResult[0]) {
        throw countResult[0];
      }
      const count = countResult[1] as number;
      const remaining = Math.max(0, limit - count);

      if (count > limit) {
        // Calculate retry-after from the oldest entry in the current window
        let retryAfterMs = WINDOW_MS;
        try {
          const oldest = await this.redis.client.zrange(key, 0, 0, 'WITHSCORES');
          if (oldest.length >= 2) {
            const oldestTs = parseInt(oldest[1], 10);
            retryAfterMs = Math.max(0, oldestTs + WINDOW_MS - now);
          }
        } catch {
          // use default window as retry-after
        }

        return { allowed: false, remaining: 0, total: limit, retryAfterMs };
      }

      return { allowed: true, remaining, total: limit };
    } catch (err) {
      this.logger.warn(`Redis rate-limit error — allowing request: ${err}`);
      return { allowed: true, remaining: limit, total: limit };
    }
  }
}
