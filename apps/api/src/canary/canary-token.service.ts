import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { RedisService } from '../redis.service';

/** Zero-width Unicode characters used to encode canary tokens invisibly. */
const ZW_CHARS = [
  '\u200B', // Zero-Width Space
  '\u200C', // Zero-Width Non-Joiner
  '\u200D', // Zero-Width Joiner
  '\uFEFF', // Zero-Width No-Break Space (BOM)
] as const;

/** Regex to extract consecutive zero-width character sequences. */
const ZW_REGEX = /[\u200B\u200C\u200D\uFEFF]{8,}/g;

/** Redis key TTL for canary tokens: 1 hour. */
const CANARY_TTL_SEC = 3600;

/**
 * Session-based canary token system using invisible Unicode markers.
 * Generates unique per-tenant-per-session tokens embedded in RAG chunks.
 * If a token appears in the LLM output, it signals data exfiltration.
 *
 * Complements the DB-based CanaryService (fake clients/policies) with a
 * real-time, session-scoped detection layer stored in Redis.
 */
@Injectable()
export class CanaryTokenService {
  private readonly logger = new Logger(CanaryTokenService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Generate a unique, invisible canary token for a tenant+session pair.
   * The token is a zero-width Unicode encoding of a SHA-256 hash,
   * stored in Redis for later detection.
   */
  async generate(tenantId: string, sessionId: string): Promise<string> {
    const entropy = randomBytes(16).toString('hex');
    const raw = `${tenantId}:${sessionId}:${Date.now()}:${entropy}`;
    const hash = createHash('sha256').update(raw).digest('hex');
    const token = this.encodeToZeroWidth(hash);

    const redisKey = `canary:${tenantId}:${sessionId}`;
    await this.redis.client.set(redisKey, token, 'EX', CANARY_TTL_SEC);
    await this.redis.client.sadd('canary:active', token);
    // Track expiry for cleanup via sorted set (score = expiry timestamp)
    await this.redis.client.zadd(
      'canary:active:expiry',
      Date.now() + CANARY_TTL_SEC * 1000,
      token,
    );

    this.logger.debug(
      `Canary token generated for tenant=${tenantId} session=${sessionId}`,
    );
    return token;
  }

  /**
   * Inject a canary token into RAG context chunks.
   * Picks a random chunk and embeds the invisible token between words
   * at a random position, making it undetectable to end users.
   */
  async inject(
    chunks: string[],
    tenantId: string,
    sessionId: string,
  ): Promise<string[]> {
    if (chunks.length === 0) return chunks;

    const token = await this.generate(tenantId, sessionId);
    const result = [...chunks];

    // Pick a random chunk to inject into
    const chunkIdx = Math.floor(Math.random() * result.length);
    const chunk = result[chunkIdx];

    // Split into words and inject token at a random word boundary
    const words = chunk.split(' ');
    if (words.length <= 1) {
      result[chunkIdx] = chunk + token;
    } else {
      const insertAt = Math.floor(Math.random() * (words.length - 1)) + 1;
      words[insertAt] = token + words[insertAt];
      result[chunkIdx] = words.join(' ');
    }

    return result;
  }

  /**
   * Detect if any active canary tokens appear in the given text.
   * This indicates potential data exfiltration — the model is outputting
   * RAG context tokens that should remain invisible.
   */
  async detect(
    text: string,
  ): Promise<{ found: boolean; tokens: string[] }> {
    const candidates = this.extractZeroWidth(text);
    if (candidates.length === 0) {
      return { found: false, tokens: [] };
    }

    // Clean expired entries from the active tracking set
    await this.redis.client.zremrangebyscore(
      'canary:active:expiry',
      '-inf',
      Date.now(),
    );

    const breachedTokens: string[] = [];
    for (const candidate of candidates) {
      const isMember = await this.redis.client.sismember(
        'canary:active',
        candidate,
      );
      if (isMember) {
        breachedTokens.push(candidate);
      }
    }

    if (breachedTokens.length > 0) {
      this.logger.error(
        `CANARY BREACH DETECTED — ${breachedTokens.length} token(s) found in output`,
      );
    }

    return {
      found: breachedTokens.length > 0,
      tokens: breachedTokens,
    };
  }

  /**
   * Remove canary tokens for a specific tenant+session from Redis.
   */
  async cleanup(tenantId: string, sessionId: string): Promise<void> {
    const redisKey = `canary:${tenantId}:${sessionId}`;
    const token = await this.redis.client.get(redisKey);
    if (token) {
      await this.redis.client.srem('canary:active', token);
      await this.redis.client.zrem('canary:active:expiry', token);
      await this.redis.client.del(redisKey);
      this.logger.debug(
        `Canary token cleaned up for tenant=${tenantId} session=${sessionId}`,
      );
    }
  }

  /**
   * Encode a hex string into zero-width Unicode characters.
   * Each hex character (0-f) is mapped to a pair of ZW chars (2 bits each),
   * producing an invisible string that encodes the full hash.
   */
  private encodeToZeroWidth(hex: string): string {
    let result = '';
    for (const char of hex) {
      const nibble = parseInt(char, 16);
      const high = (nibble >> 2) & 0x3;
      const low = nibble & 0x3;
      result += ZW_CHARS[high] + ZW_CHARS[low];
    }
    return result;
  }

  /**
   * Extract all consecutive sequences of zero-width characters from text.
   * Each sequence is a potential canary token candidate.
   */
  private extractZeroWidth(text: string): string[] {
    const matches = text.match(ZW_REGEX);
    return matches ? [...new Set(matches)] : [];
  }
}
