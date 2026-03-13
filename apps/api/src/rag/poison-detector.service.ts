import { Injectable } from '@nestjs/common';

/**
 * Detects potentially poisoned embeddings.
 * An attacker could insert documents with crafted content that
 * generates embeddings close to common queries but contains malicious instructions.
 */
@Injectable()
export class PoisonDetectorService {
  /**
   * Checks if a chunk seems suspicious based on:
   * 1. Abnormally high score (too-perfect match may indicate crafted content)
   * 2. Content anomalies (very short/long content with high score)
   * 3. Instruction-like patterns in data fields
   */
  isSuspicious(content: string, score: number): boolean {
    // Suspiciously perfect score (> 0.99) with short content
    if (score > 0.99 && content.length < 100) {
      return true;
    }

    // Content is mostly special characters (possible encoding attack)
    const specialCharRatio =
      (content.replace(/[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s.,;:()-]/g, '').length) /
      Math.max(content.length, 1);
    if (specialCharRatio > 0.3) {
      return true;
    }

    // Content has unusually high instruction density
    const instructionWords = [
      'ignore', 'override', 'system', 'prompt', 'instruction',
      'ignora', 'instrucción', 'sistema', 'ejecuta', 'comando',
    ];
    const wordCount = content.split(/\s+/).length;
    const instructionCount = instructionWords.filter((w) =>
      content.toLowerCase().includes(w),
    ).length;
    if (wordCount > 0 && instructionCount / wordCount > 0.15) {
      return true;
    }

    return false;
  }
}
