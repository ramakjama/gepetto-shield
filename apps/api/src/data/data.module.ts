import { Module } from '@nestjs/common';
import { RlsService } from './rls.service';
import { VectorService } from './vector.service';
import { PostFilterService } from './post-filter.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [RlsService, VectorService, PostFilterService, PrismaService],
  exports: [RlsService, VectorService, PostFilterService],
})
export class DataModule {}
