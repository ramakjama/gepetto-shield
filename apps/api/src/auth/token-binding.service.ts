import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class TokenBindingService {
  /**
   * Hash IP address for token binding.
   * First 16 chars of SHA-256 to prevent raw IP storage.
   */
  hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  }

  /**
   * Hash User-Agent for token binding.
   * First 16 chars of SHA-256.
   */
  hashUa(userAgent: string): string {
    return crypto.createHash('sha256').update(userAgent).digest('hex').slice(0, 16);
  }

  /**
   * Verify all three binding factors match.
   */
  verifyBinding(
    claims: { ipHash: string; uaHash: string; deviceFingerprint: string },
    ip: string,
    userAgent: string,
    deviceFingerprint: string,
  ): boolean {
    return (
      claims.ipHash === this.hashIp(ip) &&
      claims.uaHash === this.hashUa(userAgent) &&
      claims.deviceFingerprint === deviceFingerprint
    );
  }
}
