import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { JwtAccessClaims, SignedContext } from '@gepetto-shield/shared';
import { NonceService } from './nonce.service';

/**
 * HMAC-SHA256 signed context.
 * Ensures the identity context passed through the pipeline
 * hasn't been tampered with at any step.
 */
@Injectable()
export class ContextService {
  private readonly hmacKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly nonce: NonceService,
  ) {
    this.hmacKey = this.config.getOrThrow<string>('CONTEXT_HMAC_KEY');
  }

  /**
   * Create a signed context from JWT claims.
   * Includes a nonce for anti-replay protection.
   */
  async sign(claims: JwtAccessClaims, sessionId: string): Promise<SignedContext> {
    const nonceValue = await this.nonce.generate();

    const ctx = {
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
      nonce: nonceValue,
    };

    const sig = this.computeSignature(ctx);

    return { ctx, sig, alg: 'HMAC-SHA256' };
  }

  /**
   * Verify a signed context hasn't been tampered with.
   */
  async verify(signedCtx: SignedContext): Promise<boolean> {
    // Verify HMAC
    const expectedSig = this.computeSignature(signedCtx.ctx);
    const valid = crypto.timingSafeEqual(
      Buffer.from(signedCtx.sig, 'hex'),
      Buffer.from(expectedSig, 'hex'),
    );

    if (!valid) return false;

    // Verify nonce hasn't been used before (anti-replay)
    const nonceValid = await this.nonce.verify(signedCtx.ctx.nonce);
    if (!nonceValid) return false;

    // Verify timestamp is within 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - signedCtx.ctx.timestamp) > 300) return false;

    return true;
  }

  private computeSignature(ctx: any): string {
    const payload = JSON.stringify(ctx, Object.keys(ctx).sort());
    return crypto
      .createHmac('sha256', this.hmacKey)
      .update(payload)
      .digest('hex');
  }
}
