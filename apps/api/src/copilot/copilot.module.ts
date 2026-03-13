import { Module } from '@nestjs/common';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { CopilotChunkSanitizerService } from './chunk-sanitizer.service';
import { ContextBuilderService } from './context-builder.service';
import { SystemPromptService } from './system-prompt.service';
import { OutputGuardService } from './output-guard.service';
import { AuditService } from './audit.service';
import { CanaryService } from './canary.service';
import { GuardrailsModule } from '../guardrails/guardrails.module';
import { ContextModule } from '../context/context.module';
import { RagModule } from '../rag/rag.module';
import { DataModule } from '../data/data.module';
import { LlmModule } from '../llm/llm.module';
import { IncidentModule } from '../incident/incident.module';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';

@Module({
  imports: [
    GuardrailsModule,
    ContextModule,
    RagModule,
    DataModule,
    LlmModule,
    IncidentModule,
  ],
  controllers: [CopilotController],
  providers: [
    CopilotService,
    CopilotChunkSanitizerService,
    ContextBuilderService,
    SystemPromptService,
    OutputGuardService,
    AuditService,
    CanaryService,
    PrismaService,
    RedisService,
  ],
  exports: [CopilotService],
})
export class CopilotModule {}
