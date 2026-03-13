import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma.service';
import { TenantService } from './tenant.service';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const claims = request.user;

    if (!claims) {
      // Public endpoints — no tenant context needed
      return next.handle();
    }

    const vars = this.tenant.resolve(claims);

    // Whitelist of allowed RLS session variable keys (prevents SQL injection via key)
    const ALLOWED_KEYS = new Set([
      'tenant_id', 'tenant_role', 'tenant_nif', 'tenant_cif',
      'tenant_territory', 'tenant_department',
    ]);

    // Set PostgreSQL session variables for RLS using parameterized queries
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) continue;
      if (!ALLOWED_KEYS.has(key)) continue;
      await this.prisma.$executeRawUnsafe(
        `SELECT set_config($1, $2, true)`,
        `app.${key}`,
        String(value),
      );
    }

    return next.handle().pipe(
      tap({
        finalize: async () => {
          try {
            for (const [key] of Object.entries(vars)) {
              if (!ALLOWED_KEYS.has(key)) continue;
              await this.prisma.$executeRawUnsafe(
                `SELECT set_config($1, $2, true)`,
                `app.${key}`,
                '',
              );
            }
          } catch {
            // Cleanup failure is non-fatal — session vars are transaction-scoped
          }
        },
      }),
    );
  }
}
