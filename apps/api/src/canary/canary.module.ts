import { Module } from '@nestjs/common';
import { CanaryService } from './canary.service';
import { CanaryTokenService } from './canary-token.service';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';

@Module({
  providers: [CanaryService, CanaryTokenService, PrismaService, RedisService],
  exports: [CanaryService, CanaryTokenService],
})
export class CanaryModule {}
