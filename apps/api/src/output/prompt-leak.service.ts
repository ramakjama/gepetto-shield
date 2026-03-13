import { Injectable } from '@nestjs/common';

interface LeakResult {
  leaked: boolean;
  keywords: string[];
}

/**
 * Detects system prompt leakage in LLM responses.
 * Blocks responses that expose internal technical details.
 */
@Injectable()
export class PromptLeakService {
  private readonly LEAK_KEYWORDS = [
    // System architecture
    'hmac', 'sha256', 'rls', 'row level security', 'namespace',
    'set_config', 'app.tenant', 'current_setting',
    // Database internals
    'prisma', 'postgresql', 'redis', 'qdrant',
    '"Client"', '"Policy"', '"Claim"', '"WorkOrder"', '"Commission"',
    'mediadorId', 'corredorId', 'polizaId', 'siniestroId',
    // Security rules
    'R1.', 'R2.', 'R3.', 'R4.', 'R5.', 'R6.', 'R7.', 'R8.', 'R9.', 'R10.',
    'REGLAS ABSOLUTAS',
    // Auth internals
    'jwt', 'rs256', 'refresh token', 'token binding',
    'mfa secret', 'backup code',
    // Infrastructure
    'circuit breaker', 'canary token', 'jailbreak classifier',
    'embedding poisoning', 'poison detector',
    // Config
    'CONTEXT_HMAC_KEY', 'JWT_PRIVATE_KEY', 'API_KEY',
    'AZURE_OPENAI', 'GROQ_API',
  ];

  /**
   * Scan LLM response for system prompt leakage.
   */
  scan(response: string): LeakResult {
    const lowerResponse = response.toLowerCase();
    const detectedKeywords = this.LEAK_KEYWORDS.filter((kw) =>
      lowerResponse.includes(kw.toLowerCase()),
    );

    return {
      leaked: detectedKeywords.length > 0,
      keywords: detectedKeywords,
    };
  }

  /**
   * Sanitize a response by removing leaked content.
   * Returns a safe generic message if too much is leaked.
   */
  sanitize(response: string, leakResult: LeakResult): string {
    if (leakResult.keywords.length >= 3) {
      // Severe leak — replace entire response
      return 'No puedo procesar esa solicitud. Si necesitas ayuda, reformula tu pregunta.';
    }

    // Mild leak — redact specific keywords
    let sanitized = response;
    for (const kw of leakResult.keywords) {
      sanitized = sanitized.replace(new RegExp(kw, 'gi'), '[REDACTADO]');
    }
    return sanitized;
  }
}
