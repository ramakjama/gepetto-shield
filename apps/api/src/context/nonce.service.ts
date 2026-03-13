import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis.service';
import * as crypto from 'crypto';

@Injectable()
export class NonceService {
  private readonly TTL_SECONDS = 3600; // 1 hour

  constructor(private readonly redis: RedisService) {}

  /**
   * Generate a unique nonce and store in Redis.
   */
  async generate(): Promise<string> {
    const nonce = crypto.randomBytes(32).toString('hex');
    await this.redis.client.set(`nonce:${nonce}`, '1', 'EX', this.TTL_SECONDS);
    return nonce;
  }

  /**
   * Verify a nonce: must exist and be unused.
   * Consumes the nonce (one-time use).
   */
  async verify(nonce: string): Promise<boolean> {
    const result = await this.redis.client.del(`nonce:${nonce}`);
    return result === 1; // 1 = existed and was deleted, 0 = didn't exist (replay)
  }
}
