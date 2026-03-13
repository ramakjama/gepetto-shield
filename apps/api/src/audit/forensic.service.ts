import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

interface ForensicSnapshot {
  userId: string;
  timestamp: string;
  recentQueries: any[];
  sessions: any[];
  anomalyFlags: string[];
}

/**
 * Forensic snapshot service for P0 incidents.
 * Creates a complete evidence package for investigation.
 */
@Injectable()
export class ForensicService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a full forensic snapshot for a user.
   * Called on P0 incidents (canary breach, data breach).
   */
  async snapshot(userId: string): Promise<ForensicSnapshot> {
    const [recentQueries, sessions] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const anomalyFlags: string[] = [];

    // Check for suspicious patterns
    const jailbreakAttempts = recentQueries.filter(
      (q) => q.jailbreakScore && q.jailbreakScore > 0.5,
    );
    if (jailbreakAttempts.length > 0) {
      anomalyFlags.push(`${jailbreakAttempts.length} jailbreak attempts detected`);
    }

    const piiExposures = recentQueries.filter((q) => q.piiDetected);
    if (piiExposures.length > 0) {
      anomalyFlags.push(`${piiExposures.length} PII exposure attempts`);
    }

    const canaryBreaches = recentQueries.filter((q) => !q.canaryCheck);
    if (canaryBreaches.length > 0) {
      anomalyFlags.push(`${canaryBreaches.length} CANARY BREACHES — P0 CRITICAL`);
    }

    return {
      userId,
      timestamp: new Date().toISOString(),
      recentQueries,
      sessions,
      anomalyFlags,
    };
  }
}
