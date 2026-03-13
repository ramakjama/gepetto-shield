import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { ChunkSanitizerService } from './chunk-sanitizer.service';
import { PoisonDetectorService } from './poison-detector.service';
import { IndexerService } from './indexer.service';
import { DataModule } from '../data/data.module';

@Module({
  imports: [DataModule],
  providers: [RagService, ChunkSanitizerService, PoisonDetectorService, IndexerService],
  exports: [RagService, IndexerService],
})
export class RagModule {}
