import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../redis.service';

/**
 * System-level circuit breaker.
 * 1 canary breach → system OFFLINE.
 * Manual reset only by security team.
 */
@Injectable()
export class SystemCircuitBreakerService {
  private readonly KEY = 'circuit:copilot';

  constructor(private readonly redis: RedisService) {}

  /**
   * Check if the circuit is open (system offline).
   */
  async isOpen(): Promise<boolean> {
    const state = await this.redis.client.get(this.KEY);
    return state === 'OPEN';
  }

  /**
   * Trip the circuit breaker — system goes offline.
   */
  async trip(reason: string, userId?: string): Promise<void> {
    await this.redis.client.set(this.KEY, 'OPEN');
    await this.redis.client.set(
      `${this.KEY}:reason`,
      JSON.stringify({ reason, userId, timestamp: new Date().toISOString() }),
    );
    console.error(`[CIRCUIT BREAKER] TRIPPED: ${reason} (user: ${userId})`);
  }

  /**
   * Manual reset — only callable by security team.
   */
  async reset(): Promise<void> {
    await this.redis.client.del(this.KEY);
    await this.redis.client.del(`${this.KEY}:reason`);
    console.log('[CIRCUIT BREAKER] Reset by security team');
  }

  /**
   * Guard: throw if circuit is open.
   */
  async guard(): Promise<void> {
    if (await this.isOpen()) {
      throw new ServiceUnavailableException(
        'Sistema temporalmente fuera de servicio por motivos de seguridad',
      );
    }
  }

  /**
   * Get trip reason (for admin dashboard).
   */
  async getReason(): Promise<any> {
    const reason = await this.redis.client.get(`${this.KEY}:reason`);
    return reason ? JSON.parse(reason) : null;
  }
}
