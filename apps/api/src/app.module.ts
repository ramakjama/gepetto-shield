import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { RbacModule } from './rbac/rbac.module';
import { RbacGuard } from './rbac/rbac.guard';
import { TenantModule } from './tenant/tenant.module';
import { TenantInterceptor } from './tenant/tenant.interceptor';
import { GuardrailsModule } from './guardrails/guardrails.module';
import { ContextModule } from './context/context.module';
import { DataModule } from './data/data.module';
import { RagModule } from './rag/rag.module';
import { LlmModule } from './llm/llm.module';
import { OutputModule } from './output/output.module';
import { CanaryModule } from './canary/canary.module';
import { AuditModule } from './audit/audit.module';
import { AnomalyModule } from './anomaly/anomaly.module';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import { IncidentModule } from './incident/incident.module';
import { CopilotModule } from './copilot/copilot.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AuthModule,
    RbacModule,
    TenantModule,
    GuardrailsModule,
    ContextModule,
    DataModule,
    RagModule,
    LlmModule,
    OutputModule,
    CanaryModule,
    AuditModule,
    AnomalyModule,
    CircuitBreakerModule,
    IncidentModule,
    CopilotModule,
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    RedisService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
  exports: [PrismaService, RedisService],
})
export class AppModule {}
