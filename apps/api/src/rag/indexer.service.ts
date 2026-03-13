import { Injectable } from '@nestjs/common';
import { VectorService } from '../data/vector.service';
import * as crypto from 'crypto';

interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
}

interface Chunk {
  id: string;
  content: string;
  metadata: Record<string, any>;
}

@Injectable()
export class IndexerService {
  private readonly CHUNK_SIZE = 512;
  private readonly CHUNK_OVERLAP = 50;

  constructor(private readonly vector: VectorService) {}

  /**
   * Ingest a document: chunk it, generate embeddings, store in tenant namespace.
   */
  async ingest(
    document: Document,
    role: string,
    tenantId: string,
    embedFn: (text: string) => Promise<number[]>,
  ): Promise<number> {
    const chunks = this.chunk(document);

    const points = await Promise.all(
      chunks.map(async (chunk) => ({
        id: chunk.id,
        vector: await embedFn(chunk.content),
        payload: {
          content: chunk.content,
          source: document.id,
          ...chunk.metadata,
          ...document.metadata,
        },
      })),
    );

    await this.vector.upsert(points, role, tenantId);
    return chunks.length;
  }

  /**
   * Split document into overlapping chunks.
   * Uses token-approximate splitting (words ≈ 0.75 tokens).
   */
  private chunk(document: Document): Chunk[] {
    const words = document.content.split(/\s+/);
    const chunks: Chunk[] = [];
    const wordsPerChunk = Math.floor(this.CHUNK_SIZE * 0.75);
    const overlapWords = Math.floor(this.CHUNK_OVERLAP * 0.75);

    for (let i = 0; i < words.length; i += wordsPerChunk - overlapWords) {
      const chunkWords = words.slice(i, i + wordsPerChunk);
      if (chunkWords.length < 10) break; // Skip tiny trailing chunks

      const content = chunkWords.join(' ');
      const id = crypto
        .createHash('sha256')
        .update(`${document.id}:${i}`)
        .digest('hex')
        .slice(0, 16);

      chunks.push({
        id,
        content,
        metadata: {
          chunk_index: chunks.length,
          total_chunks: 0, // Updated below
          char_start: document.content.indexOf(chunkWords[0]),
        },
      });
    }

    // Update total_chunks
    for (const chunk of chunks) {
      chunk.metadata.total_chunks = chunks.length;
    }

    return chunks;
  }
}
