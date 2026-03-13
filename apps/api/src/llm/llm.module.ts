import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { PromptBuilderService } from './prompt-builder.service';
import { RedisService } from '../redis.service';

@Module({
  providers: [LlmService, PromptBuilderService, RedisService],
  exports: [LlmService, PromptBuilderService],
})
export class LlmModule {}
