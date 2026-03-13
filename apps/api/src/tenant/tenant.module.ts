import { Module } from '@nestjs/common';
import { TenantInterceptor } from './tenant.interceptor';
import { TenantService } from './tenant.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [TenantInterceptor, TenantService, PrismaService],
  exports: [TenantInterceptor, TenantService],
})
export class TenantModule {}
