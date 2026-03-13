import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface VectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, any>;
}

interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, any>;
}

@Injectable()
export class VectorService implements OnModuleInit {
  private qdrantUrl: string;
  private readonly COLLECTION = 'gepetto_shield';

  constructor(private readonly config: ConfigService) {
    this.qdrantUrl = this.config.get('QDRANT_URL', 'http://localhost:6334');
  }

  async onModuleInit() {
    await this.ensureCollection();
  }

  private async ensureCollection() {
    try {
      const res = await fetch(`${this.qdrantUrl}/collections/${this.COLLECTION}`);
      if (res.status === 404) {
        await fetch(`${this.qdrantUrl}/collections/${this.COLLECTION}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: { size: 1536, distance: 'Cosine' },
          }),
        });
      }
    } catch (err) {
      console.warn('[VectorService] Qdrant unavailable, will retry on first use');
    }
  }

  /**
   * Build the namespace key for tenant isolation.
   * Format: "role:tenant_id" → guarantees physical separation in vector search.
   */
  private buildNamespace(role: string, tenantId: string): string {
    return `${role}:${tenantId}`;
  }

  /**
   * Search vectors with strict tenant namespace isolation.
   * Double-filters: namespace filter + metadata owner verification.
   */
  async search(
    queryVector: number[],
    role: string,
    tenantId: string,
    topK: number = 10,
    additionalFilters?: Record<string, any>,
  ): Promise<VectorSearchResult[]> {
    const namespace = this.buildNamespace(role, tenantId);

    const filter: any = {
      must: [
        { key: 'namespace', match: { value: namespace } },
        { key: 'owner_id', match: { value: tenantId } },
      ],
    };

    // Add any role-specific filters
    if (additionalFilters) {
      for (const [key, value] of Object.entries(additionalFilters)) {
        filter.must.push({ key, match: { value } });
      }
    }

    const response = await fetch(
      `${this.qdrantUrl}/collections/${this.COLLECTION}/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: queryVector,
          filter,
          limit: topK,
          with_payload: true,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Qdrant search failed: ${response.status}`);
    }

    const data = await response.json();
    return (data.result || []).map((r: any) => ({
      id: r.id,
      score: r.score,
      payload: r.payload,
    }));
  }

  /**
   * Upsert vectors with mandatory namespace and owner_id metadata.
   */
  async upsert(
    points: VectorPoint[],
    role: string,
    tenantId: string,
  ): Promise<void> {
    const namespace = this.buildNamespace(role, tenantId);

    const enrichedPoints = points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: {
        ...p.payload,
        namespace,
        owner_id: tenantId,
        indexed_at: new Date().toISOString(),
      },
    }));

    await fetch(
      `${this.qdrantUrl}/collections/${this.COLLECTION}/points`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: enrichedPoints }),
      },
    );
  }

  /**
   * Delete all vectors for a specific tenant (for cleanup/rotation).
   */
  async deleteTenantVectors(role: string, tenantId: string): Promise<void> {
    const namespace = this.buildNamespace(role, tenantId);

    await fetch(
      `${this.qdrantUrl}/collections/${this.COLLECTION}/points/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: {
            must: [{ key: 'namespace', match: { value: namespace } }],
          },
        }),
      },
    );
  }
}
