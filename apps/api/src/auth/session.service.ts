import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Create a new session. Invalidates ALL previous sessions for the user
   * (max 1 concurrent session policy).
   */
  async create(
    userId: string,
    ipHash: string,
    uaHash: string,
    deviceFingerprint: string,
  ) {
    // Invalidate all existing sessions
    await this.invalidateAllForUser(userId);

    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: 'pending-' + Date.now(), // Updated after refresh token is generated
        ipHash,
        uaHash,
        deviceFingerprint,
        expiresAt,
        isActive: true,
      },
    });

    // Track in Redis for fast lookup
    await this.redis.client.set(
      `session:${session.id}`,
      JSON.stringify({ userId, ipHash, uaHash, deviceFingerprint }),
      'EX',
      8 * 60 * 60,
    );

    return session;
  }

  async invalidate(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { isActive: false },
    });
    await this.redis.client.del(`session:${sessionId}`);
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, isActive: true },
      select: { id: true },
    });

    if (sessions.length > 0) {
      await this.prisma.session.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });

      const pipeline = this.redis.client.pipeline();
      for (const s of sessions) {
        pipeline.del(`session:${s.id}`);
      }
      await pipeline.exec();
    }
  }

  async isActive(sessionId: string): Promise<boolean> {
    // Fast path: Redis check
    const cached = await this.redis.client.get(`session:${sessionId}`);
    if (cached) return true;

    // Fallback: DB check
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { isActive: true, expiresAt: true },
    });

    return !!session && session.isActive && session.expiresAt > new Date();
  }
}
