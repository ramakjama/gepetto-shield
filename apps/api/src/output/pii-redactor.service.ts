import { Injectable } from '@nestjs/common';
import {
  Role,
  PiiType,
  PiiMatch,
  PII_PATTERNS,
  detectPii,
  redactPii,
} from '@gepetto-shield/shared';

/**
 * Role-based PII redaction rules.
 * Each role lists PII types that MUST be redacted regardless of data ownership.
 * All roles always redact tarjetaCredito (nobody sees full CC numbers).
 */
const ROLE_REDACTION_RULES: Record<Role, PiiType[]> = {
  // Reparador: cannot see client personal identifiers
  [Role.REPARADOR]: [
    'nif',
    'nie',
    'email',
    'telefono',
    'tarjetaCredito',
  ],
  // Taller: same restrictions as reparador
  [Role.TALLER_AUTOPRESTO]: [
    'nif',
    'nie',
    'email',
    'telefono',
    'tarjetaCredito',
  ],
  // Perito: cannot see financial data
  [Role.PERITO]: ['iban', 'tarjetaCredito'],
  // Clients: cannot see internal reference numbers beyond their own
  [Role.CLIENTE_PARTICULAR]: [
    'numPoliza',
    'numSiniestro',
    'tarjetaCredito',
  ],
  [Role.CLIENTE_EMPRESA]: [
    'numPoliza',
    'numSiniestro',
    'tarjetaCredito',
  ],
  // All other roles: at minimum redact credit cards
  [Role.AGENTE_EXCLUSIVO_TITULAR]: ['tarjetaCredito'],
  [Role.AGENTE_EXCLUSIVO_EMPLEADO]: ['tarjetaCredito'],
  [Role.CORREDOR]: ['tarjetaCredito'],
  [Role.ABOGADO_PREPERSA]: ['tarjetaCredito'],
  [Role.EMPLEADO_SINIESTROS]: ['tarjetaCredito'],
  [Role.EMPLEADO_COMERCIAL]: ['tarjetaCredito'],
  [Role.EMPLEADO_SALUD]: ['tarjetaCredito'],
};

@Injectable()
export class PiiRedactorService {
  /**
   * Redact PII from text based on the requesting user's role.
   * Returns the sanitized text plus a list of every PII match that was redacted.
   */
  redactForRole(
    text: string,
    role: Role,
  ): { sanitized: string; redacted: PiiMatch[] } {
    const typesToRedact = ROLE_REDACTION_RULES[role] ?? ['tarjetaCredito'];

    // Detect all PII present before redaction (only for the types we will redact)
    const allMatches = detectPii(text);
    const redacted = allMatches.filter((m) =>
      typesToRedact.includes(m.type),
    );

    // Apply redaction
    const sanitized = redactPii(text, typesToRedact);

    return { sanitized, redacted };
  }

  /**
   * Get the list of PII types that are always redacted for a given role.
   */
  getRedactionRules(role: Role): PiiType[] {
    return ROLE_REDACTION_RULES[role] ?? ['tarjetaCredito'];
  }
}
