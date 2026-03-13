import { Injectable, ForbiddenException } from '@nestjs/common';
import type { JwtAccessClaims } from '@gepetto-shield/shared';
import { Role } from '@gepetto-shield/shared';

interface FilterableRecord {
  mediadorId?: string;
  corredorId?: string;
  clienteNif?: string;
  empresaCif?: string;
  peritoAsignadoId?: string;
  abogadoId?: string;
  reparadorId?: string;
  tallerId?: string;
  owner_id?: string;
  [key: string]: any;
}

@Injectable()
export class PostFilterService {
  /**
   * Application-level post-filter: verifies EVERY record returned by DB/vector
   * belongs to the requesting tenant. Belt-and-suspenders after RLS + namespace.
   *
   * Returns only records that pass ownership check.
   * Logs and rejects any cross-tenant leakage.
   */
  filter<T extends FilterableRecord>(
    records: T[],
    claims: JwtAccessClaims,
  ): T[] {
    return records.filter((record) => this.checkOwnership(record, claims));
  }

  /**
   * Strict single-record check. Throws if ownership fails.
   */
  verifyOrThrow(record: FilterableRecord, claims: JwtAccessClaims): void {
    if (!this.checkOwnership(record, claims)) {
      throw new ForbiddenException(
        'Acceso denegado — registro no pertenece a tu ámbito',
      );
    }
  }

  private checkOwnership(
    record: FilterableRecord,
    claims: JwtAccessClaims,
  ): boolean {
    const tenantId = claims.orgId;
    const role = claims.role as Role;

    switch (role) {
      case Role.AGENTE_EXCLUSIVO_TITULAR:
      case Role.AGENTE_EXCLUSIVO_EMPLEADO:
        return (
          record.mediadorId === tenantId || record.owner_id === tenantId
        );

      case Role.CORREDOR:
        return (
          record.corredorId === tenantId || record.owner_id === tenantId
        );

      case Role.PERITO:
        return (
          record.peritoAsignadoId === tenantId ||
          record.owner_id === tenantId
        );

      case Role.REPARADOR:
        return (
          record.reparadorId === tenantId || record.owner_id === tenantId
        );

      case Role.TALLER_AUTOPRESTO:
        return (
          record.tallerId === tenantId || record.owner_id === tenantId
        );

      case Role.ABOGADO_PREPERSA:
        return (
          record.abogadoId === tenantId || record.owner_id === tenantId
        );

      case Role.EMPLEADO_SINIESTROS:
      case Role.EMPLEADO_COMERCIAL:
      case Role.EMPLEADO_SALUD:
        return record.owner_id === tenantId;

      case Role.CLIENTE_PARTICULAR:
        return (
          record.clienteNif === claims.sub || record.owner_id === claims.sub
        );

      case Role.CLIENTE_EMPRESA:
        return (
          record.empresaCif === claims.sub || record.owner_id === claims.sub
        );

      default:
        return false; // Deny by default
    }
  }
}
