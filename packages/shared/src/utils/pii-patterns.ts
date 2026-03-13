/**
 * COPILOT OCCIDENT — PII Detection Patterns
 * Spanish-specific PII regex patterns for output validation
 */

export const PII_PATTERNS = {
  nif: {
    regex: /\b[0-9]{8}[A-HJ-NP-TV-Z]\b/g,
    description: 'Spanish NIF (DNI)',
    redaction: '[NIF_REDACTADO]',
  },
  nie: {
    regex: /\b[XYZ][0-9]{7}[A-Z]\b/g,
    description: 'Spanish NIE (foreign ID)',
    redaction: '[NIE_REDACTADO]',
  },
  iban: {
    regex: /\bES\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{2}[\s]?\d{10}\b/g,
    description: 'Spanish IBAN',
    redaction: '[IBAN_REDACTADO]',
  },
  telefono: {
    regex: /\b[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g,
    description: 'Spanish phone number',
    redaction: '[TEL_REDACTADO]',
  },
  email: {
    regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}\b/g,
    description: 'Email address',
    redaction: '[EMAIL_REDACTADO]',
  },
  tarjetaCredito: {
    regex: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,
    description: 'Credit card number',
    redaction: '****-****-****-****',
  },
  matricula: {
    regex: /\b\d{4}[- ]?[A-Z]{3}\b/g,
    description: 'Spanish vehicle plate',
    redaction: '[MATRICULA_REDACTADO]',
  },
  numPoliza: {
    regex: /\b(?:POL|P|OCC)[-/]?\d{6,12}\b/gi,
    description: 'Policy number',
    redaction: '[POLIZA_REDACTADO]',
  },
  numSiniestro: {
    regex: /\b(?:SIN|S|OCC-S)[-/]?\d{6,12}\b/gi,
    description: 'Claim number',
    redaction: '[SINIESTRO_REDACTADO]',
  },
} as const;

export type PiiType = keyof typeof PII_PATTERNS;

export interface PiiMatch {
  type: PiiType;
  value: string;
  index: number;
}

export function detectPii(text: string): PiiMatch[] {
  const matches: PiiMatch[] = [];

  for (const [type, config] of Object.entries(PII_PATTERNS)) {
    const regex = new RegExp(config.regex.source, config.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        type: type as PiiType,
        value: match[0],
        index: match.index,
      });
    }
  }

  return matches;
}

export function redactPii(text: string, typesToRedact?: PiiType[]): string {
  let result = text;
  const types = typesToRedact ?? (Object.keys(PII_PATTERNS) as PiiType[]);

  for (const type of types) {
    const config = PII_PATTERNS[type];
    const regex = new RegExp(config.regex.source, config.regex.flags);
    result = result.replace(regex, config.redaction);
  }

  return result;
}
