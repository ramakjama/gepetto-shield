import { Injectable } from '@nestjs/common';
import { Role, PiiMatch } from '@gepetto-shield/shared';
import { PiiRedactorService } from './pii-redactor.service';
import { CanaryTokenService } from '../canary/canary-token.service';

export interface OutputGuardResult {
  sanitizedResponse: string;
  piiRedacted: PiiMatch[];
  crossTenantLeak: boolean;
  promptLeak: boolean;
  canaryBreach: boolean;
}

/**
 * Regex patterns that indicate the LLM is leaking its system prompt.
 * Covers English and Spanish prompt-extraction markers.
 */
const PROMPT_LEAK_PATTERNS: RegExp[] = [
  /system\s*prompt/i,
  /you\s+are\s+a\b/i,
  /your\s+instructions\s+are/i,
  /ignore\s+(?:all\s+)?previous\s+instructions/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /<\|system\|>/i,
  /\bSYSTEM:/,
  /\bHuman:/,
  /\bAssistant:/,
  // Spanish variants
  /eres\s+un\s+asistente/i,
  /tus\s+instrucciones\s+son/i,
  /prompt\s+del\s+sistema/i,
  /ignora\s+(?:todas\s+)?las\s+instrucciones\s+anteriores/i,
  /instrucciones\s+originales/i,
  /mi\s+prompt\s+(?:es|dice|contiene)/i,
];

/**
 * Patterns to extract entity IDs from response text.
 * These are UUIDs and Occident-specific reference numbers.
 */
const ENTITY_ID_PATTERNS: RegExp[] = [
  // UUID v4
  /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  // Policy numbers: POL-123456, P-123456, OCC-123456
  /\b(?:POL|P|OCC)[-/]?\d{6,12}\b/gi,
  // Claim numbers: SIN-123456, S-123456, OCC-S-123456
  /\b(?:SIN|S|OCC-S)[-/]?\d{6,12}\b/gi,
];

@Injectable()
export class OutputGuardService {
  constructor(
    private readonly piiRedactor: PiiRedactorService,
    private readonly canaryTokenService: CanaryTokenService,
  ) {}

  /**
   * Full output validation pipeline.
   * Chains: PII redaction -> cross-tenant check -> prompt leak detection -> canary check.
   */
  async validate(
    response: string,
    context: {
      tenantId: string;
      role: Role;
      entityIds?: string[];
    },
  ): Promise<OutputGuardResult> {
    // 1. PII redaction based on role
    const { sanitized, redacted } = this.piiRedactor.redactForRole(
      response,
      context.role,
    );

    // 2. Cross-tenant leak detection
    const crossTenantLeak = this.detectCrossTenantLeak(
      sanitized,
      context.entityIds ?? [],
    );

    // 3. System prompt leak detection
    const promptLeak = this.detectPromptLeak(sanitized);

    // 4. Canary token check
    const canaryResult = await this.canaryTokenService.detect(sanitized);
    const canaryBreach = canaryResult.found;

    return {
      sanitizedResponse: sanitized,
      piiRedacted: redacted,
      crossTenantLeak,
      promptLeak,
      canaryBreach,
    };
  }

  /**
   * Extract entity IDs from the response and check if any are NOT in the
   * allowed whitelist for this tenant. Unknown IDs indicate a cross-tenant leak.
   */
  private detectCrossTenantLeak(
    text: string,
    allowedEntityIds: string[],
  ): boolean {
    if (allowedEntityIds.length === 0) {
      // No whitelist provided — cannot verify, skip check
      return false;
    }

    const allowedSet = new Set(
      allowedEntityIds.map((id) => id.toLowerCase()),
    );

    for (const pattern of ENTITY_ID_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const foundId = match[0].toLowerCase();
        if (!allowedSet.has(foundId)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if the response contains fragments that suggest the system prompt
   * has been leaked or the model is echoing its instructions.
   */
  private detectPromptLeak(text: string): boolean {
    for (const pattern of PROMPT_LEAK_PATTERNS) {
      if (pattern.test(text)) {
        return true;
      }
    }
    return false;
  }
}
