import { Role } from './roles';

/**
 * COPILOT OCCIDENT — Scope Definitions
 * Each role has explicit allowed scopes. Deny-by-default.
 */

export const SCOPES = {
  // Client data
  'read:own_clients': 'Read own portfolio clients',
  'read:own_agency_clients': 'Read agency clients (employee of agency)',
  'read:brokered_clients': 'Read brokered clients',

  // Policies
  'read:own_policies': 'Read own portfolio policies',
  'read:own_agency_policies': 'Read agency policies',
  'read:brokered_policies': 'Read brokered policies',
  'read:my_policies': 'Read my own policies (client)',
  'read:company_policies': 'Read company policies',
  'read:policy_coverage': 'Read policy coverage details',

  // Claims
  'read:own_claims': 'Read own portfolio claims',
  'read:own_agency_claims': 'Read agency claims',
  'read:brokered_claims': 'Read brokered claims',
  'read:assigned_claims': 'Read assigned claims (perito)',
  'read:territory_claims': 'Read territory claims (empleado)',
  'read:my_claims': 'Read my own claims (client)',
  'read:company_claims': 'Read company claims',

  // Work Orders
  'read:assigned_work_orders': 'Read assigned work orders (reparador)',
  'read:assigned_vehicle_repairs': 'Read assigned vehicle repairs (taller)',

  // Legal
  'read:assigned_legal_cases': 'Read assigned legal cases',
  'read:case_claim_details': 'Read case claim details',
  'read:case_medical_reports': 'Read case medical reports',

  // Financial
  'read:own_commissions': 'Read own commissions',
  'read:brokered_commissions': 'Read brokered commissions',
  'read:own_receipts': 'Read own receipts',
  'read:my_receipts': 'Read my receipts (client)',

  // Commercial
  'read:own_production': 'Read own production metrics',
  'read:own_renewals': 'Read own renewal pipeline',
  'read:own_kpis': 'Read own KPI metrics',
  'read:territory_agents': 'Read territory agents (empleado comercial)',
  'read:territory_production': 'Read territory production (agregado)',
  'read:territory_kpis': 'Read territory KPIs',

  // Health
  'read:health_authorizations': 'Read health authorizations (empleado salud)',
  'read:medical_network': 'Read medical provider network',

  // General
  'read:product_conditions': 'Read product conditions (public)',
  'read:claim_photos': 'Read claim photos',
  'read:my_agent_contact': 'Read my agent contact info (client)',
  'read:company_fleet': 'Read company vehicle fleet',
  'read:employee_coverage': 'Read employee coverage',

  // Admin
  'read:audit_log': 'Read audit log',
  'read:security_dashboard': 'Read security dashboard',
  'manage:canary': 'Manage canary tokens',
  'manage:circuit_breaker': 'Manage circuit breaker',
} as const;

export type Scope = keyof typeof SCOPES;

export const ROLE_SCOPES: Record<Role, readonly Scope[]> = {
  [Role.AGENTE_EXCLUSIVO_TITULAR]: [
    'read:own_clients',
    'read:own_policies',
    'read:own_claims',
    'read:own_receipts',
    'read:own_commissions',
    'read:own_production',
    'read:own_renewals',
    'read:own_kpis',
    'read:product_conditions',
  ],

  [Role.AGENTE_EXCLUSIVO_EMPLEADO]: [
    'read:own_agency_clients',
    'read:own_agency_policies',
    'read:own_agency_claims',
    'read:product_conditions',
  ],

  [Role.CORREDOR]: [
    'read:brokered_clients',
    'read:brokered_policies',
    'read:brokered_claims',
    'read:brokered_commissions',
    'read:product_conditions',
  ],

  [Role.PERITO]: [
    'read:assigned_claims',
    'read:claim_photos',
    'read:policy_coverage',
  ],

  [Role.REPARADOR]: [
    'read:assigned_work_orders',
  ],

  [Role.TALLER_AUTOPRESTO]: [
    'read:assigned_vehicle_repairs',
  ],

  [Role.ABOGADO_PREPERSA]: [
    'read:assigned_legal_cases',
    'read:case_claim_details',
    'read:case_medical_reports',
  ],

  [Role.EMPLEADO_SINIESTROS]: [
    'read:territory_claims',
    'read:product_conditions',
  ],

  [Role.EMPLEADO_COMERCIAL]: [
    'read:territory_agents',
    'read:territory_production',
    'read:territory_kpis',
    'read:product_conditions',
  ],

  [Role.EMPLEADO_SALUD]: [
    'read:health_authorizations',
    'read:medical_network',
  ],

  [Role.CLIENTE_PARTICULAR]: [
    'read:my_policies',
    'read:my_claims',
    'read:my_receipts',
    'read:my_agent_contact',
  ],

  [Role.CLIENTE_EMPRESA]: [
    'read:company_policies',
    'read:company_claims',
    'read:company_fleet',
    'read:employee_coverage',
    'read:my_agent_contact',
  ],
};

export function hasScope(role: Role, scope: Scope): boolean {
  return ROLE_SCOPES[role]?.includes(scope) ?? false;
}

export function getScopesForRole(role: Role): readonly Scope[] {
  return ROLE_SCOPES[role] ?? [];
}
