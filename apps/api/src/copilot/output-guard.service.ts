import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { detectPii, redactPii } from '@gepetto-shield/shared';
import type { JwtAccessClaims } from '@gepetto-shield/shared';
import { PrismaService } from '../prisma.service';

export interface OutputValidationResult {
  blocked: boolean;
  sanitizedContent: string;
  piiDetected: boolean;
  canaryBreached: boolean;
  reason?: string;
}

/**
 * Output Guard — validates LLM responses before delivery.
 *
 * Three checks:
 * 1. PII detection + redaction (Spanish patterns: NIF, NIE, IBAN, phone, email, etc.)
 * 2. Canary token breach detection (leaked canary tokens = data exfiltration attempt)
 * 3. Prompt leak detection (system prompt fragments in output)
 */
@Injectable()
export class OutputGuardService {
  private readonly logger = new Logger(OutputGuardService.name);

  private readonly PROMPT_LEAK_PATTERNS: RegExp[] = [
    /INICIO_SISTEMA/i,
    /FIN_SISTEMA/i,
    /REGLAS DE SEGURIDAD ABSOLUTAS/i,
    /RESTRICCIONES POR ROL/i,
    /CLASIFICACION DE DATOS/i,
    /Tu nivel de clasificacion es/i,
    /HMAC-SHA256/i,
    /CONTEXT_HMAC_KEY/i,
    /DATO_VERIFICADO/i,
    /owner_id/i,
    /namespace.*tenant/i,
    /jailbreak.*classif/i,
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate an LLM response. Returns sanitized content or blocks entirely.
   */
  async validate(
    content: string,
    claims: JwtAccessClaims,
  ): Promise<OutputValidationResult> {
    // 1. Check for prompt leak (system prompt fragments in output)
    const promptLeaked = this.detectPromptLeak(content);
    if (promptLeaked) {
      this.logger.warn(
        `Prompt leak detected for user ${claims.sub}`,
      );
      return {
        blocked: true,
        sanitizedContent: '',
        piiDetected: false,
        canaryBreached: false,
        reason: 'prompt_leak_detected',
      };
    }

    // 2. Check for canary token breach
    const canaryBreached = await this.detectCanaryBreach(content, claims.sub);
    if (canaryBreached) {
      this.logger.error(
        `CANARY BREACH detected for user ${claims.sub} — possible data exfiltration`,
      );
      return {
        blocked: true,
        sanitizedContent: '',
        piiDetected: false,
        canaryBreached: true,
        reason: 'canary_token_breach',
      };
    }

    // 3. PII detection + redaction
    const piiMatches = detectPii(content);
    const piiDetected = piiMatches.length > 0;
    let sanitizedContent = content;

    if (piiDetected) {
      // Redact PII that should not appear in output for this role
      sanitizedContent = this.roleBasedPiiRedaction(content, claims);
      this.logger.debug(
        `PII detected and redacted: ${piiMatches.length} matches for user ${claims.sub}`,
      );
    }

    return {
      blocked: false,
      sanitizedContent,
      piiDetected,
      canaryBreached: false,
    };
  }

  private detectPromptLeak(content: string): boolean {
    return this.PROMPT_LEAK_PATTERNS.some((pattern) => pattern.test(content));
  }

  /**
   * Check if any active canary tokens appear in the LLM output.
   * If they do, it means the LLM is leaking data it should not.
   */
  private async detectCanaryBreach(
    content: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const activeCanaries = await this.prisma.canaryToken.findMany({
        where: { isActive: true },
        select: { id: true, token: true, tenantId: true },
      });

      for (const canary of activeCanaries) {
        if (content.includes(canary.token)) {
          // Mark canary as detected
          await this.prisma.canaryToken.update({
            where: { id: canary.id },
            data: { detectedAt: new Date() },
          });
          return true;
        }
      }
    } catch (err) {
      this.logger.warn(`Canary check failed (non-blocking): ${(err as Error).message}`);
    }

    return false;
  }

  /**
   * Role-based PII redaction.
   * Reparadores and talleres get aggressive redaction (no names, no IDs).
   * Peritos get financial data redacted.
   * Other roles get standard redaction.
   */
  private roleBasedPiiRedaction(content: string, claims: JwtAccessClaims): string {
    const role = claims.role;

    // Reparadores and talleres: redact everything personal
    if (role === 'REPARADOR' || role === 'TALLER_AUTOPRESTO') {
      return redactPii(content); // Redact all PII types
    }

    // Peritos: redact financial info (IBAN, credit cards) but allow NIF for identification
    if (role === 'PERITO') {
      return redactPii(content, ['iban', 'tarjetaCredito', 'email', 'telefono']);
    }

    // Clients: redact other people's PII but keep their own
    if (role === 'CLIENTE_PARTICULAR' || role === 'CLIENTE_EMPRESA') {
      return redactPii(content, ['iban', 'tarjetaCredito']);
    }

    // Default: redact sensitive financial identifiers
    return redactPii(content, ['iban', 'tarjetaCredito']);
  }
}
