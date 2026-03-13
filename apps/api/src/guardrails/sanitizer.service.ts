import { Injectable } from '@nestjs/common';

const MAX_CHARS = 2000;

export interface SanitizeAudit {
  originalLength: number;
  finalLength: number;
  wasTruncated: boolean;
  charsRemoved: number;
  invisibleCharsFound: number;
  homoglyphsReplaced: number;
  base64BlocksNeutralized: number;
  htmlEntitiesDecoded: number;
  urlEncodingsDecoded: number;
  htmlTagsStripped: number;
  markdownLinksStripped: number;
}

export interface SanitizeResult {
  text: string;
  audit: SanitizeAudit;
}

@Injectable()
export class SanitizerService {
  private readonly INVISIBLE_CHARS =
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFE00-\uFE0F\uFEFF\uFFF0-\uFFFB\uFFFC\u{E0001}\u{E0020}-\u{E007F}]/gu;

  private readonly HOMOGLYPHS: Record<string, string> = {
    // Cyrillic uppercase
    '\u0410': 'A', '\u0412': 'B', '\u0421': 'C', '\u0415': 'E',
    '\u041D': 'H', '\u041A': 'K', '\u041C': 'M', '\u041E': 'O',
    '\u0420': 'P', '\u0422': 'T', '\u0425': 'X', '\u0423': 'Y',
    // Cyrillic lowercase
    '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p',
    '\u0441': 'c', '\u0443': 'y', '\u0445': 'x', '\u0456': 'i',
    '\u0455': 's',
    // Greek uppercase
    '\u0391': 'A', '\u0392': 'B', '\u0395': 'E', '\u0397': 'H',
    '\u0399': 'I', '\u039A': 'K', '\u039C': 'M', '\u039D': 'N',
    '\u039F': 'O', '\u03A1': 'P', '\u03A4': 'T', '\u03A7': 'X',
    '\u0396': 'Z',
    // Greek lowercase
    '\u03B1': 'a', '\u03B5': 'e', '\u03BF': 'o', '\u03C1': 'p',
    '\u03BA': 'k', '\u03BD': 'v',
  };

  private readonly BASE64_INJECTION_RE =
    /ignor|system|instruc|override|olvida|forget|prompt|assistant|<script/i;

  private readonly HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;

  private readonly MARKDOWN_LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;

  private readonly BASE64_BLOCK_RE =
    /(?:base64[:\s]+)?[A-Za-z0-9+/]{20,}={0,2}/g;

  private readonly HTML_ENTITY_NAMED: Record<string, string> = {
    '&lt;': '<', '&gt;': '>', '&amp;': '&',
    '&quot;': '"', '&apos;': "'", '&nbsp;': ' ',
  };

  private readonly HTML_ENTITY_NAMED_RE =
    /&(lt|gt|amp|quot|apos|nbsp);/g;

  private readonly HTML_ENTITY_DEC_RE = /&#(\d{1,6});/g;

  private readonly HTML_ENTITY_HEX_RE = /&#x([0-9a-fA-F]{1,6});/g;

  private readonly URL_ENCODED_RE = /%([0-9a-fA-F]{2})/g;

  sanitize(input: string): SanitizeResult {
    const audit: SanitizeAudit = {
      originalLength: input.length,
      finalLength: 0,
      wasTruncated: false,
      charsRemoved: 0,
      invisibleCharsFound: 0,
      homoglyphsReplaced: 0,
      base64BlocksNeutralized: 0,
      htmlEntitiesDecoded: 0,
      urlEncodingsDecoded: 0,
      htmlTagsStripped: 0,
      markdownLinksStripped: 0,
    };

    let text = input;

    // 1. NFKC normalization
    text = text.normalize('NFKC');

    // 2. Remove invisible/control characters
    const invisibleMatches = text.match(this.INVISIBLE_CHARS);
    audit.invisibleCharsFound = invisibleMatches?.length ?? 0;
    text = text.replace(this.INVISIBLE_CHARS, '');

    // 3. Replace homoglyphs
    let homoglyphCount = 0;
    let result = '';
    for (const char of text) {
      const replacement = this.HOMOGLYPHS[char];
      if (replacement) {
        result += replacement;
        homoglyphCount++;
      } else {
        result += char;
      }
    }
    text = result;
    audit.homoglyphsReplaced = homoglyphCount;

    // 4. Neutralize base64 fragments
    let base64Count = 0;
    text = text.replace(this.BASE64_BLOCK_RE, (match) => {
      try {
        const decoded = Buffer.from(match.replace(/^base64[:\s]+/, ''), 'base64').toString('utf-8');
        if (this.BASE64_INJECTION_RE.test(decoded)) {
          base64Count++;
          return '[BASE64_BLOCKED]';
        }
      } catch {
        // not valid base64, leave as-is
      }
      return match;
    });
    audit.base64BlocksNeutralized = base64Count;

    // 5. Decode HTML entities
    let htmlEntityCount = 0;

    text = text.replace(this.HTML_ENTITY_NAMED_RE, (match, name: string) => {
      const full = `&${name};`;
      const decoded = this.HTML_ENTITY_NAMED[full];
      if (decoded) {
        htmlEntityCount++;
        return decoded;
      }
      return match;
    });

    text = text.replace(this.HTML_ENTITY_DEC_RE, (_, code: string) => {
      htmlEntityCount++;
      const num = parseInt(code, 10);
      return num > 0 && num <= 0x10FFFF ? String.fromCodePoint(num) : '';
    });

    text = text.replace(this.HTML_ENTITY_HEX_RE, (_, code: string) => {
      htmlEntityCount++;
      const num = parseInt(code, 16);
      return num > 0 && num <= 0x10FFFF ? String.fromCodePoint(num) : '';
    });

    audit.htmlEntitiesDecoded = htmlEntityCount;

    // 6. Decode URL-encoded sequences
    let urlDecodeCount = 0;
    text = text.replace(this.URL_ENCODED_RE, (_, hex: string) => {
      urlDecodeCount++;
      return String.fromCharCode(parseInt(hex, 16));
    });
    audit.urlEncodingsDecoded = urlDecodeCount;

    // 7. Strip HTML/XML tags
    const tagMatches = text.match(this.HTML_TAG_RE);
    audit.htmlTagsStripped = tagMatches?.length ?? 0;
    text = text.replace(this.HTML_TAG_RE, '');

    // 8. Strip markdown links [text](url) → text
    const mdMatches = text.match(this.MARKDOWN_LINK_RE);
    audit.markdownLinksStripped = mdMatches?.length ?? 0;
    text = text.replace(this.MARKDOWN_LINK_RE, '$1');

    // 9. Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // 10. Truncate
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      audit.wasTruncated = true;
    }

    audit.finalLength = text.length;
    audit.charsRemoved = audit.originalLength - audit.finalLength;

    return { text, audit };
  }
}
