import { Module } from '@nestjs/common';
import { SystemCircuitBreakerService } from './circuit-breaker.service';
import { RedisService } from '../redis.service';

@Module({
  providers: [SystemCircuitBreakerService, RedisService],
  exports: [SystemCircuitBreakerService],
})
export class IncidentModule {}
