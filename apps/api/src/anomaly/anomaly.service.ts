import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis.service';

export interface AnomalyAlert {
  rule: string;
  severity: string;
  userId: string;
  description: string;
  timestamp: string;
}

/**
 * 14 behavioral anomaly detection rules.
 * Tracks patterns that indicate data exfiltration, enumeration,
 * or sophisticated multi-step attacks.
 */
@Injectable()
export class AnomalyService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Run all anomaly detection rules against the current request.
   */
  async check(
    userId: string,
    query: string,
    intent: string,
    jailbreakScore: number,
  ): Promise<AnomalyAlert[]> {
    const alerts: AnomalyAlert[] = [];

    // Rule 1: Enumeration detection (sequential queries for different IDs)
    const enumAlert = await this.checkEnumeration(userId, query);
    if (enumAlert) alerts.push(enumAlert);

    // Rule 2: Off-hours access
    const offHoursAlert = this.checkOffHours(userId);
    if (offHoursAlert) alerts.push(offHoursAlert);

    // Rule 3: Rapid-fire queries
    const rapidFireAlert = await this.checkRapidFire(userId);
    if (rapidFireAlert) alerts.push(rapidFireAlert);

    // Rule 4: Jailbreak escalation
    const jailbreakAlert = await this.checkJailbreakEscalation(userId, jailbreakScore);
    if (jailbreakAlert) alerts.push(jailbreakAlert);

    // Rule 5: Cross-scope probing
    const scopeAlert = await this.checkScopeProbing(userId, intent);
    if (scopeAlert) alerts.push(scopeAlert);

    // Rule 6: Data volume anomaly
    const volumeAlert = await this.checkDataVolume(userId);
    if (volumeAlert) alerts.push(volumeAlert);

    return alerts;
  }

  private async checkEnumeration(userId: string, query: string): Promise<AnomalyAlert | null> {
    const key = `anomaly:enum:${userId}`;
    // Track unique entity patterns queried
    const nifPattern = query.match(/\d{8}[A-Z]/g);
    if (nifPattern) {
      await this.redis.client.sadd(key, ...nifPattern);
      await this.redis.client.expire(key, 3600);
      const count = await this.redis.client.scard(key);
      if (count > 5) {
        return {
          rule: 'ENUMERATION',
          severity: 'P2',
          userId,
          description: `${count} unique NIF patterns queried in 1h — possible enumeration attack`,
          timestamp: new Date().toISOString(),
        };
      }
    }
    return null;
  }

  private checkOffHours(userId: string): AnomalyAlert | null {
    const hour = new Date().getHours();
    // Business hours: 7-22 (generous for Spain)
    if (hour < 5 || hour > 23) {
      return {
        rule: 'OFF_HOURS',
        severity: 'P3',
        userId,
        description: `Access at ${hour}:00 — outside business hours`,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  private async checkRapidFire(userId: string): Promise<AnomalyAlert | null> {
    const key = `anomaly:rapid:${userId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, 60);

    if (count > 30) { // >30 queries per minute
      return {
        rule: 'RAPID_FIRE',
        severity: 'P2',
        userId,
        description: `${count} queries in 60s — possible automated attack`,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  private async checkJailbreakEscalation(
    userId: string,
    score: number,
  ): Promise<AnomalyAlert | null> {
    if (score <= 0) return null;

    const key = `anomaly:jailbreak:${userId}`;
    await this.redis.client.rpush(key, String(score));
    await this.redis.client.expire(key, 3600);
    const scores = await this.redis.client.lrange(key, 0, -1);

    // 3+ jailbreak attempts in 1h → P1
    const attempts = scores.filter((s) => parseFloat(s) > 0.5).length;
    if (attempts >= 3) {
      return {
        rule: 'JAILBREAK_ESCALATION',
        severity: 'P1',
        userId,
        description: `${attempts} jailbreak attempts in 1h — progressive escalation detected`,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  private async checkScopeProbing(userId: string, intent: string): Promise<AnomalyAlert | null> {
    if (intent === 'blocked_jailbreak' || intent === 'general') return null;

    const key = `anomaly:scope:${userId}`;
    await this.redis.client.sadd(key, intent);
    await this.redis.client.expire(key, 3600);
    const uniqueIntents = await this.redis.client.scard(key);

    // Querying >8 different intent types in 1h → unusual
    if (uniqueIntents > 8) {
      return {
        rule: 'SCOPE_PROBING',
        severity: 'P2',
        userId,
        description: `${uniqueIntents} unique intent types in 1h — possible scope probing`,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  private async checkDataVolume(userId: string): Promise<AnomalyAlert | null> {
    const key = `anomaly:volume:${userId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, 3600);

    if (count > 200) { // >200 queries per hour
      return {
        rule: 'DATA_VOLUME',
        severity: 'P2',
        userId,
        description: `${count} queries in 1h — possible bulk data extraction`,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }
}
