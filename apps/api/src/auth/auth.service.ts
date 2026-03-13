import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { SessionService } from './session.service';
import { MfaService } from './mfa.service';
import { TokenBindingService } from './token-binding.service';
import type { JwtAccessClaims, JwtRefreshClaims } from '@gepetto-shield/shared';
import { ROLE_SCOPES } from '@gepetto-shield/shared';

@Injectable()
export class AuthService {
  private privateKey!: jose.KeyLike;
  private publicKey!: jose.KeyLike;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly tokenBinding: TokenBindingService,
  ) {
    this.initKeys();
  }

  private async initKeys() {
    const privPem = this.config.getOrThrow<string>('JWT_PRIVATE_KEY');
    const pubPem = this.config.getOrThrow<string>('JWT_PUBLIC_KEY');
    this.privateKey = await jose.importPKCS8(privPem, 'RS256');
    this.publicKey = await jose.importSPKI(pubPem, 'RS256');
  }

  async login(
    email: string,
    password: string,
    mfaCode: string | undefined,
    ip: string,
    userAgent: string,
    deviceFingerprint: string,
  ): Promise<{ accessToken: string; refreshToken: string } | { requireMfa: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || user.deletedAt) {
      // Constant-time: hash anyway to prevent timing oracle
      await bcrypt.hash('dummy', 12);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // MFA check
    if (user.mfaEnabled) {
      if (!mfaCode) {
        return { requireMfa: true };
      }
      const mfaResult = this.mfa.verify(user.mfaSecret!, mfaCode, user.mfaBackupCodes ?? []);
      if (!mfaResult.valid) {
        throw new UnauthorizedException('Código MFA inválido');
      }
      // If a backup code was consumed, persist the remaining codes
      if (mfaResult.usedBackupCode && mfaResult.remainingBackupCodes) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { mfaBackupCodes: mfaResult.remainingBackupCodes },
        });
      }
    }

    // Token binding hashes
    const ipHash = this.tokenBinding.hashIp(ip);
    const uaHash = this.tokenBinding.hashUa(userAgent);

    // Create session (invalidates previous)
    const session = await this.sessions.create(user.id, ipHash, uaHash, deviceFingerprint);

    // Generate tokens
    const accessToken = await this.signAccessToken(user, session.id, ipHash, uaHash, deviceFingerprint);
    const refreshToken = await this.signRefreshToken(user.id, session.id);

    // Store refresh token hash in session
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: refreshHash },
    });

    return { accessToken, refreshToken };
  }

  async refresh(
    refreshToken: string,
    ip: string,
    userAgent: string,
    deviceFingerprint: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Verify refresh JWT
    let payload: JwtRefreshClaims;
    try {
      const result = await jose.jwtVerify(refreshToken, this.publicKey, {
        issuer: 'gepetto-shield-auth',
      });
      payload = result.payload as unknown as JwtRefreshClaims;
    } catch {
      throw new UnauthorizedException('Token de refresco inválido');
    }

    // Find session by refresh token hash
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: refreshHash },
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      // REUSE DETECTION: if session exists but inactive, someone reused a rotated token
      if (session && !session.isActive) {
        await this.sessions.invalidateAllForUser(payload.sub);
      }
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    // Verify token binding
    const ipHash = this.tokenBinding.hashIp(ip);
    const uaHash = this.tokenBinding.hashUa(userAgent);
    if (session.ipHash !== ipHash || session.uaHash !== uaHash || session.deviceFingerprint !== deviceFingerprint) {
      await this.sessions.invalidate(session.id);
      throw new UnauthorizedException('Token binding mismatch — sesión invalidada');
    }

    // Invalidate old refresh token
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: 'rotated-' + Date.now() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    // Issue new tokens
    const newAccessToken = await this.signAccessToken(user, session.id, ipHash, uaHash, deviceFingerprint);
    const newRefreshToken = await this.signRefreshToken(user.id, session.id);

    // Store new refresh hash
    const newRefreshHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: newRefreshHash },
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.invalidate(sessionId);
  }

  async verifyAccessToken(token: string): Promise<JwtAccessClaims> {
    try {
      const result = await jose.jwtVerify(token, this.publicKey, {
        issuer: 'gepetto-shield-auth',
      });
      return result.payload as unknown as JwtAccessClaims;
    } catch {
      throw new UnauthorizedException('Token de acceso inválido');
    }
  }

  private async signAccessToken(
    user: any,
    sessionId: string,
    ipHash: string,
    uaHash: string,
    deviceFingerprint: string,
  ): Promise<string> {
    const role = user.role as keyof typeof ROLE_SCOPES;
    const scopes = ROLE_SCOPES[role] || [];

    const claims: Omit<JwtAccessClaims, 'iat' | 'exp'> = {
      iss: 'gepetto-shield-auth',
      sub: user.id,
      jti: crypto.randomUUID(),
      role: user.role,
      channel: user.channel,
      scopes: [...scopes],
      orgId: user.orgId,
      orgDisplay: user.orgDisplay,
      territory: user.territory || undefined,
      department: user.department || undefined,
      legacyBrand: user.legacyBrand || undefined,
      mfaVerified: user.mfaEnabled,
      authTime: Math.floor(Date.now() / 1000),
      dataClearance: user.dataClearance,
      maxConcurrentSessions: 1,
      ipHash,
      uaHash,
      deviceFingerprint,
    };

    return new jose.SignJWT(claims as unknown as jose.JWTPayload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(this.privateKey);
  }

  private async signRefreshToken(userId: string, sessionId: string): Promise<string> {
    return new jose.SignJWT({
      iss: 'gepetto-shield-auth',
      sub: userId,
      jti: crypto.randomUUID(),
      sessionId,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(this.privateKey);
  }
}
