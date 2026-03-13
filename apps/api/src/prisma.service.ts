import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Set RLS session variables for tenant isolation.
   * Called by TenantInterceptor before every query.
   */
  async setTenantContext(vars: Record<string, string>): Promise<void> {
    const statements = Object.entries(vars).map(
      ([key, value]) =>
        `SET LOCAL app.${key} = '${value.replace(/'/g, "''")}'`,
    );
    await this.$executeRawUnsafe(
      `BEGIN; ${statements.join('; ')}`,
    );
  }

  async clearTenantContext(): Promise<void> {
    await this.$executeRawUnsafe('COMMIT');
  }
}
