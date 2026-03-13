import { Module } from '@nestjs/common';
import { SanitizerService } from './sanitizer.service';
import { JailbreakService } from './jailbreak.service';
import { IntentService } from './intent.service';
import { RateLimitService } from './rate-limit.service';
import { GuardrailsGuard } from './guardrails.guard';
import { RedisService } from '../redis.service';

@Module({
  providers: [
    SanitizerService,
    JailbreakService,
    IntentService,
    RateLimitService,
    GuardrailsGuard,
    RedisService,
  ],
  exports: [
    SanitizerService,
    JailbreakService,
    IntentService,
    RateLimitService,
    GuardrailsGuard,
  ],
})
export class GuardrailsModule {}
