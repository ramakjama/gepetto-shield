import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { TenantVars } from '../tenant/tenant.service';

@Injectable()
export class RlsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Execute a callback within a tenant-isolated transaction.
   * Sets RLS session variables, executes the callback, then resets.
   */
  async withTenant<T>(vars: TenantVars, fn: () => Promise<T>): Promise<T> {
    const setStatements = Object.entries(vars)
      .filter(([, v]) => v !== undefined)
      .map(([key, value]) => ({
        key: `app.${key}`,
        value: String(value),
      }));

    // Use interactive transaction for proper RLS isolation
    return this.prisma.$transaction(async (tx) => {
      // Set all tenant variables
      for (const { key, value } of setStatements) {
        await tx.$executeRawUnsafe(
          `SELECT set_config($1, $2, true)`,
          key,
          value,
        );
      }

      return fn();
    });
  }

  /**
   * Verify that a record belongs to the current tenant.
   * Belt-and-suspenders check AFTER RLS already filtered.
   */
  async verifyOwnership(
    table: string,
    recordId: string,
    tenantField: string,
    tenantValue: string,
  ): Promise<boolean> {
    const result = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM "${table}" WHERE id = $1 AND "${tenantField}" = $2`,
      recordId,
      tenantValue,
    );
    return (result as any)[0]?.count > 0;
  }
}
