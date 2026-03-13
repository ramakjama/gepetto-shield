import { Injectable } from '@nestjs/common';

interface PiiMatch {
  type: string;
  value: string;
  redacted: string;
  index: number;
}

/**
 * Scans LLM output for PII that should not be exposed.
 * Spanish document patterns: NIF, NIE, IBAN, phone, email,
 * credit card, vehicle plate, policy number, claim number.
 */
@Injectable()
export class PiiScannerService {
  private readonly PATTERNS: { type: string; regex: RegExp; mask: (m: string) => string }[] = [
    {
      type: 'NIF',
      regex: /\b[0-9]{8}[A-Z]\b/g,
      mask: (m) => `****${m.slice(-3)}`,
    },
    {
      type: 'NIE',
      regex: /\b[XYZ][0-9]{7}[A-Z]\b/g,
      mask: (m) => `****${m.slice(-3)}`,
    },
    {
      type: 'IBAN',
      regex: /\b[A-Z]{2}[0-9]{2}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\b/g,
      mask: (m) => `${m.slice(0, 4)}****${m.slice(-4)}`,
    },
    {
      type: 'PHONE',
      regex: /\b(?:\+34\s?)?[6-9][0-9]{2}\s?[0-9]{3}\s?[0-9]{3}\b/g,
      mask: (m) => `****${m.slice(-3)}`,
    },
    {
      type: 'EMAIL',
      regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
      mask: (m) => {
        const [local, domain] = m.split('@');
        return `${local[0]}***@${domain}`;
      },
    },
    {
      type: 'CREDIT_CARD',
      regex: /\b[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,
      mask: (m) => `****${m.slice(-4)}`,
    },
    {
      type: 'VEHICLE_PLATE',
      regex: /\b[0-9]{4}\s?[A-Z]{3}\b/g,
      mask: (m) => `****${m.slice(-3)}`,
    },
  ];

  /**
   * Scan output for PII and return matches.
   */
  scan(text: string): PiiMatch[] {
    const matches: PiiMatch[] = [];

    for (const { type, regex, mask } of this.PATTERNS) {
      const re = new RegExp(regex.source, regex.flags);
      let match;
      while ((match = re.exec(text)) !== null) {
        matches.push({
          type,
          value: match[0],
          redacted: mask(match[0]),
          index: match.index,
        });
      }
    }

    return matches;
  }

  /**
   * Redact all PII from output text.
   */
  redact(text: string): { text: string; piiDetected: boolean; count: number } {
    let redacted = text;
    let count = 0;

    for (const { regex, mask } of this.PATTERNS) {
      const re = new RegExp(regex.source, regex.flags);
      redacted = redacted.replace(re, (match) => {
        count++;
        return mask(match);
      });
    }

    return { text: redacted, piiDetected: count > 0, count };
  }
}
