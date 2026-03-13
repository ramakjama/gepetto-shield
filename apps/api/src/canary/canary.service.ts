import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

interface CanaryCheckResult {
  breachDetected: boolean;
  canaryId?: string;
  ownerAgentId?: string;
  requestingAgentId?: string;
  severity: 'NONE' | 'P0';
}

/**
 * Canary token system: fake clients/policies deployed per agent.
 * If an agent sees another agent's canary → BREACH DETECTED → P0.
 */
@Injectable()
export class CanaryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deploy canary tokens for a specific agent.
   * Creates fake client + fake policy that only that agent should see.
   */
  async deploy(ownerAgentId: string): Promise<string> {
    const canary = await this.prisma.canaryToken.create({
      data: {
        ownerAgentId,
        fakeName: this.generateFakeName(),
        fakeNif: this.generateFakeNif(),
        fakePhone: `6${Math.floor(10000000 + Math.random() * 89999999)}`,
        fakePolicyNum: `POL-CANARY-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      },
    });

    // Insert canary client into Client table
    await this.prisma.client.create({
      data: {
        mediadorId: ownerAgentId,
        nombre: canary.fakeName,
        nif: canary.fakeNif,
        telefono: canary.fakePhone,
        isCanary: true,
        canaryId: canary.id,
      },
    });

    return canary.id;
  }

  /**
   * Check if a response contains ANY canary token from another agent.
   * This is the critical cross-tenant breach detection.
   */
  async checkResponse(
    responseText: string,
    requestingAgentId: string,
  ): Promise<CanaryCheckResult> {
    // Get all active canary tokens NOT owned by the requesting agent
    const canaries = await this.prisma.canaryToken.findMany({
      where: {
        isActive: true,
        NOT: { ownerAgentId: requestingAgentId },
      },
    });

    for (const canary of canaries) {
      const indicators = [
        canary.fakeName,
        canary.fakeNif,
        canary.fakePhone,
        canary.fakePolicyNum,
      ].filter(Boolean);

      for (const indicator of indicators) {
        if (indicator && responseText.includes(indicator)) {
          return {
            breachDetected: true,
            canaryId: canary.id,
            ownerAgentId: canary.ownerAgentId,
            requestingAgentId,
            severity: 'P0',
          };
        }
      }
    }

    return { breachDetected: false, severity: 'NONE' };
  }

  /**
   * Rotate canary tokens: deactivate old ones, deploy new ones.
   */
  async rotate(ownerAgentId: string): Promise<void> {
    // Deactivate old canaries
    await this.prisma.canaryToken.updateMany({
      where: { ownerAgentId, isActive: true },
      data: { isActive: false, rotatedAt: new Date() },
    });

    // Remove old canary clients
    await this.prisma.client.deleteMany({
      where: { mediadorId: ownerAgentId, isCanary: true },
    });

    // Deploy new canary
    await this.deploy(ownerAgentId);
  }

  private generateFakeName(): string {
    const names = ['Alejandro', 'Beatriz', 'Carmen', 'Daniel', 'Elena', 'Francisco', 'Gloria', 'Héctor'];
    const surnames = ['Canario', 'Señuelo', 'Ficticio', 'Trampa', 'Cebo', 'Fantasma', 'Inventado', 'Simulado'];
    return `${names[Math.floor(Math.random() * names.length)]} ${surnames[Math.floor(Math.random() * surnames.length)]}`;
  }

  private generateFakeNif(): string {
    const num = Math.floor(10000000 + Math.random() * 89999999);
    const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
    return `${num}${letters[num % 23]}`;
  }
}
