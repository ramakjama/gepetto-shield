import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type {
  JwtAccessClaims,
  SignedContext,
} from '@gepetto-shield/shared';

/**
 * Capa 2 — Build and sign identity context from JWT claims.
 *
 * Creates a tamper-evident context object using HMAC-SHA256 that
 * travels through the entire copilot pipeline. Any modification
 * to the context after signing will be detected by verify().
 *
 * Anti-replay protection:
 * - Nonce: 32-byte crypto-random, unique per request
 * - Timestamp: requests older than 5 minutes are rejected
 *
 * This service is a standalone builder (does not depend on NonceService/Redis)
 * for use in the copilot pipeline where the ContextService from the context
 * module handles the full nonce lifecycle.
 */
@Injectable()
export class ContextBuilderService {
  private readonly hmacKey: string;
  private static readonly MAX_AGE_SECONDS = 300; // 5 minutes

  constructor(private readonly config: ConfigService) {
    this.hmacKey = this.config.getOrThrow<string>('CONTEXT_HMAC_KEY');
  }

  /**
   * Build and HMAC-sign a context object from JWT claims.
   * Includes a crypto-random nonce and current timestamp for anti-replay.
   */
  sign(claims: JwtAccessClaims, sessionId: string): SignedContext {
    const nonce = crypto.randomBytes(32).toString('hex');

    const ctx: SignedContext['ctx'] = {
      agentId: claims.sub,
      role: claims.role,
      channel: claims.channel,
      orgId: claims.orgId,
      orgDisplay: claims.orgDisplay,
      territory: claims.territory,
      department: claims.department,
      scopes: [...claims.scopes],
      dataClearance: claims.dataClearance,
      sessionId,
      timestamp: Math.floor(Date.now() / 1000),
      nonce,
    };

    const sig = this.computeSignature(ctx);

    return { ctx, sig, alg: 'HMAC-SHA256' };
  }

  /**
   * Verify that a signed context has not been tampered with.
   *
   * Checks:
   * 1. HMAC signature validity (timing-safe comparison to prevent oracle attacks)
   * 2. Timestamp freshness (max 5 minutes to prevent replay)
   */
  verify(signedCtx: SignedContext): boolean {
    // Verify HMAC signature
    const expectedSig = this.computeSignature(signedCtx.ctx);

    const sigBuffer = Buffer.from(signedCtx.sig, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    // Length check first — timingSafeEqual requires equal length buffers
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    const signatureValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    if (!signatureValid) {
      return false;
    }

    // Verify timestamp freshness
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - signedCtx.ctx.timestamp) > ContextBuilderService.MAX_AGE_SECONDS) {
      return false;
    }

    return true;
  }

  /**
   * Compute HMAC-SHA256 over the context object.
   * Keys are sorted to ensure deterministic JSON serialization.
   */
  private computeSignature(ctx: SignedContext['ctx']): string {
    const sortedKeys = Object.keys(ctx).sort();
    const payload = JSON.stringify(ctx, sortedKeys);
    return crypto
      .createHmac('sha256', this.hmacKey)
      .update(payload)
      .digest('hex');
  }
}
