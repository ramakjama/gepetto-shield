import { Injectable } from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';

@Injectable()
export class MfaService {
  generateSecret(email: string): { secret: string; otpauthUrl: string; backupCodes: string[] } {
    const generated = speakeasy.generateSecret({
      name: `GepettoShield:${email}`,
      issuer: 'Gepetto Shield',
      length: 32,
    });

    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase(),
    );

    return {
      secret: generated.base32,
      otpauthUrl: generated.otpauth_url!,
      backupCodes,
    };
  }

  async generateQR(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl);
  }

  verify(
    secret: string,
    token: string,
    backupCodes: string[],
  ): { valid: boolean; usedBackupCode?: string; remainingBackupCodes?: string[] } {
    // Try TOTP first
    const totpValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1, // Allow 1 step tolerance (±30s)
    });

    if (totpValid) return { valid: true };

    // Try backup codes — single-use: return which code was consumed
    const upperToken = token.toUpperCase();
    const idx = backupCodes.indexOf(upperToken);
    if (idx !== -1) {
      const remaining = [...backupCodes];
      remaining.splice(idx, 1);
      return { valid: true, usedBackupCode: upperToken, remainingBackupCodes: remaining };
    }

    return { valid: false };
  }
}
