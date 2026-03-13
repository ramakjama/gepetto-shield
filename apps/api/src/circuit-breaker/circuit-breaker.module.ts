import { Module } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RedisService } from '../redis.service';

@Module({
  providers: [CircuitBreakerService, RedisService],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}
