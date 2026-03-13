import { Injectable } from '@nestjs/common';
import type { JwtAccessClaims } from '@gepetto-shield/shared';
import { Role } from '@gepetto-shield/shared';

export interface TenantVars {
  tenant_id: string;
  tenant_role: string;
  tenant_nif?: string;
  tenant_cif?: string;
  tenant_territory?: string;
  tenant_department?: string;
}

@Injectable()
export class TenantService {
  /**
   * Resolve RLS session variables from JWT claims.
   * These are injected into PostgreSQL via SET LOCAL before each query.
   */
  resolve(claims: JwtAccessClaims): TenantVars {
    const vars: TenantVars = {
      tenant_id: claims.orgId,
      tenant_role: claims.role,
    };

    // Client roles need NIF/CIF for self-isolation
    if (claims.role === Role.CLIENTE_PARTICULAR) {
      vars.tenant_nif = claims.sub; // sub contains the client NIF for client roles
    }

    if (claims.role === Role.CLIENTE_EMPRESA) {
      vars.tenant_cif = claims.sub;
    }

    // Territory-based roles
    if (claims.territory) {
      vars.tenant_territory = claims.territory;
    }

    // Department-based roles (empleado_siniestros)
    if (claims.department) {
      vars.tenant_department = claims.department;
    }

    return vars;
  }
}
