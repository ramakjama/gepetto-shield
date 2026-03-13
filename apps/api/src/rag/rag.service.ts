import { Injectable } from '@nestjs/common';
import { VectorService } from '../data/vector.service';
import { PostFilterService } from '../data/post-filter.service';
import { ChunkSanitizerService } from './chunk-sanitizer.service';
import { PoisonDetectorService } from './poison-detector.service';
import type { JwtAccessClaims } from '@gepetto-shield/shared';

export interface RagChunk {
  id: string;
  content: string;
  score: number;
  source: string;
  metadata: Record<string, any>;
}

@Injectable()
export class RagService {
  constructor(
    private readonly vector: VectorService,
    private readonly postFilter: PostFilterService,
    private readonly chunkSanitizer: ChunkSanitizerService,
    private readonly poisonDetector: PoisonDetectorService,
  ) {}

  /**
   * Hybrid retrieval pipeline:
   * 1. Vector search with namespace isolation
   * 2. Post-filter ownership verification
   * 3. Chunk sanitization (indirect injection defense)
   * 4. Poison detection (embedding outlier check)
   * 5. Return clean, verified chunks
   */
  async retrieve(
    queryEmbedding: number[],
    claims: JwtAccessClaims,
    options: { topK?: number; minScore?: number } = {},
  ): Promise<RagChunk[]> {
    const { topK = 10, minScore = 0.65 } = options;

    // 1. Vector search with namespace isolation
    const results = await this.vector.search(
      queryEmbedding,
      claims.role,
      claims.orgId,
      topK * 2, // Over-fetch for post-filter
    );

    // 2. Score threshold filter
    const scored = results.filter((r) => r.score >= minScore);

    // 3. Post-filter: verify ownership at application level
    const owned = this.postFilter.filter(
      scored.map((r) => ({
        ...r.payload,
        id: r.id,
        score: r.score,
      })),
      claims,
    );

    // 4. Chunk sanitization: scan for indirect injection attempts
    const sanitized = owned
      .map((r) => ({
        id: r.id,
        content: this.chunkSanitizer.sanitize(r.content || ''),
        score: r.score,
        source: r.source || 'unknown',
        metadata: r,
        isClean: this.chunkSanitizer.isClean(r.content || ''),
      }))
      .filter((r) => r.isClean);

    // 5. Poison detection: flag embedding outliers
    const safe = sanitized.filter(
      (chunk) => !this.poisonDetector.isSuspicious(chunk.content, chunk.score),
    );

    // Return top-K after all filters
    return safe.slice(0, topK).map(({ isClean, ...chunk }) => chunk);
  }
}
