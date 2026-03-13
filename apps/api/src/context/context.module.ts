import { Module } from '@nestjs/common';
import { ContextService } from './context.service';
import { NonceService } from './nonce.service';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';

@Module({
  providers: [ContextService, NonceService, PrismaService, RedisService],
  exports: [ContextService, NonceService],
})
export class ContextModule {}
