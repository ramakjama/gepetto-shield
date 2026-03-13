import { Injectable } from '@nestjs/common';

/**
 * Scans retrieved chunks for indirect prompt injection attempts.
 * An attacker could insert malicious instructions into data fields
 * that get retrieved by RAG and fed into the LLM context.
 */
@Injectable()
export class ChunkSanitizerService {
  private readonly INJECTION_PATTERNS: RegExp[] = [
    // Instruction override
    /ignora\s+(las\s+)?instrucciones/i,
    /ignore\s+(all\s+)?instructions/i,
    /olvida\s+(las\s+)?reglas/i,
    /forget\s+(all\s+)?rules/i,
    /new\s+instructions?\s*:/i,
    /system\s*:\s*/i,

    // Role manipulation
    /eres\s+(ahora\s+)?un/i,
    /you\s+are\s+(now\s+)?a/i,
    /act\s+as\s+/i,
    /actúa\s+como\s+/i,
    /pretend\s+(to\s+be|you're)/i,

    // Data exfiltration
    /muestra\s+todos\s+los/i,
    /show\s+all\s+(the\s+)?/i,
    /list\s+every/i,
    /dump\s+(all|the|database)/i,
    /dame\s+(todos?\s+)?(los\s+)?datos/i,

    // Cross-tenant
    /de\s+otro\s+agente/i,
    /otro\s+mediador/i,
    /another\s+agent/i,
    /other\s+tenant/i,

    // Technical injection
    /\]\]\s*\[\[/,  // Markdown injection
    /<script/i,
    /javascript:/i,
    /on(error|load|click)\s*=/i,
  ];

  /**
   * Check if a chunk is clean (no injection detected).
   */
  isClean(content: string): boolean {
    return !this.INJECTION_PATTERNS.some((pattern) => pattern.test(content));
  }

  /**
   * Sanitize a chunk by removing suspicious content.
   * Used when we want to use the chunk but strip dangerous parts.
   */
  sanitize(content: string): string {
    let sanitized = content;

    // Strip invisible Unicode characters
    sanitized = sanitized.replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g, '');

    // Strip HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }
}
