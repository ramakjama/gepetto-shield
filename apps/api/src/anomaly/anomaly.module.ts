import { Module } from '@nestjs/common';
import { AnomalyService } from './anomaly.service';
import { RedisService } from '../redis.service';

@Module({
  providers: [AnomalyService, RedisService],
  exports: [AnomalyService],
})
export class AnomalyModule {}
