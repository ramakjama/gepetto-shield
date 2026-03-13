import { Module } from '@nestjs/common';
import { CanaryModule } from '../canary/canary.module';
import { PiiRedactorService } from './pii-redactor.service';
import { OutputGuardService } from './output-guard.service';

@Module({
  imports: [CanaryModule],
  providers: [PiiRedactorService, OutputGuardService],
  exports: [OutputGuardService, PiiRedactorService],
})
export class OutputModule {}
