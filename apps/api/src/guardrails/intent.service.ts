import { Injectable } from '@nestjs/common';
import { Role, Scope, JwtAccessClaims, ROLE_SCOPES } from '@gepetto-shield/shared';

export interface IntentResult {
  intent: string;
  confidence: number;
}

export interface IntentValidation {
  allowed: boolean;
  intent: string;
  requiredScope?: Scope;
  reason?: string;
}

const ALLOW_ALL = '__ALLOW_ALL__';

/**
 * Intent-to-scope mapping.
 * null = always blocked. ALLOW_ALL = no scope required.
 */
const INTENT_SCOPE_MAP: Record<string, Scope | typeof ALLOW_ALL | null> = {
  // Standard agent/mediator queries
  consulta_poliza: 'read:own_policies',
  consulta_siniestro: 'read:own_claims',
  consulta_cliente: 'read:own_clients',
  consulta_recibo: 'read:own_receipts',
  consulta_comision: 'read:own_commissions',
  consulta_produccion: 'read:own_production',
  consulta_renovacion: 'read:own_renewals',
  consulta_kpi: 'read:own_kpis',
  consulta_cobertura: 'read:policy_coverage',
  consulta_fotos_siniestro: 'read:claim_photos',

  // Prepersa queries
  consulta_orden_trabajo: 'read:assigned_work_orders',
  consulta_reparacion_vehiculo: 'read:assigned_vehicle_repairs',
  consulta_caso_legal: 'read:assigned_legal_cases',
  consulta_informe_medico: 'read:case_medical_reports',

  // Health
  autorizacion_salud: 'read:health_authorizations',
  consulta_red_medica: 'read:medical_network',

  // General / public
  consulta_condiciones_producto: 'read:product_conditions',
  consulta_agente: 'read:my_agent_contact',

  // Company client queries
  consulta_flota: 'read:company_fleet',
  consulta_cobertura_empleados: 'read:employee_coverage',

  // Territory (empleado)
  consulta_agentes_territorio: 'read:territory_agents',
  consulta_produccion_territorio: 'read:territory_production',
  consulta_kpi_territorio: 'read:territory_kpis',

  // Client self-service
  consulta_mis_polizas: 'read:my_policies',
  consulta_mis_siniestros: 'read:my_claims',
  consulta_mis_recibos: 'read:my_receipts',
  consulta_polizas_empresa: 'read:company_policies',
  consulta_siniestros_empresa: 'read:company_claims',

  // Agency employee scoped queries
  consulta_polizas_agencia: 'read:own_agency_policies',
  consulta_siniestros_agencia: 'read:own_agency_claims',
  consulta_clientes_agencia: 'read:own_agency_clients',

  // Brokered queries
  consulta_polizas_corredor: 'read:brokered_policies',
  consulta_siniestros_corredor: 'read:brokered_claims',
  consulta_clientes_corredor: 'read:brokered_clients',
  consulta_comisiones_corredor: 'read:brokered_commissions',

  // Always blocked intents
  cross_tenant_access: null,
  identity_change: null,
  system_prompt_extract: null,
  privilege_escalation: null,
  data_export_bulk: null,

  // General conversation — always allowed, no scope required
  general_conversation: ALLOW_ALL,
};

const CLIENT_ROLES = new Set<Role>([
  Role.CLIENTE_PARTICULAR,
  Role.CLIENTE_EMPRESA,
]);

const EMPRESA_ROLES = new Set<Role>([
  Role.CLIENTE_EMPRESA,
]);

const AGENCY_EMPLOYEE_ROLES = new Set<Role>([
  Role.AGENTE_EXCLUSIVO_EMPLEADO,
]);

const BROKER_ROLES = new Set<Role>([
  Role.CORREDOR,
]);

interface KeywordRule {
  keywords: RegExp;
  intent: string;
  clientIntent?: string;
  empresaIntent?: string;
  agencyEmployeeIntent?: string;
  brokerIntent?: string;
  confidence: number;
}

/**
 * Keyword rules ordered by specificity (most specific first).
 * Each rule maps a regex to an intent, with optional role-specific overrides.
 */
const KEYWORD_RULES: KeywordRule[] = [
  // ── Blocked intents (highest priority) ──
  { keywords: /(?:otro\s+tenant|other\s+tenant|otra\s+agencia|other\s+agency|datos?\s+de\s+otr[oa]|access\s+other)/i, intent: 'cross_tenant_access', confidence: 0.9 },
  { keywords: /(?:cambiar?\s+identidad|change\s+identity|soy\s+otro|i\s+am\s+another|suplantar)/i, intent: 'identity_change', confidence: 0.9 },
  { keywords: /(?:system\s+prompt|instrucciones\s+del\s+sistema|tu\s+prompt|your\s+prompt|tus\s+instrucciones\s+internas)/i, intent: 'system_prompt_extract', confidence: 0.9 },
  { keywords: /(?:privilegios?|privilege|escalar|escalate|hacerme\s+admin|make\s+me\s+admin|ser\s+superusuario)/i, intent: 'privilege_escalation', confidence: 0.9 },
  { keywords: /(?:exportar\s+todo|export\s+all|descargar\s+(?:toda\s+la\s+)?base|download\s+(?:all|entire)\s+database|volcado\s+completo|full\s+dump)/i, intent: 'data_export_bulk', confidence: 0.9 },

  // ── Specific compound queries (before single-keyword) ──
  { keywords: /(?:orden\s+de\s+trabajo|work\s+order)/i, intent: 'consulta_orden_trabajo', confidence: 0.85 },
  { keywords: /(?:reparaci[oó]n\s+(?:de\s+)?veh[ií]culo|vehicle\s+repair)/i, intent: 'consulta_reparacion_vehiculo', confidence: 0.85 },
  { keywords: /(?:caso\s+legal|legal\s+case|expediente\s+(?:legal|jur[ií]dico))/i, intent: 'consulta_caso_legal', confidence: 0.85 },
  { keywords: /(?:informe\s+m[eé]dico|medical\s+report|parte\s+m[eé]dico)/i, intent: 'consulta_informe_medico', confidence: 0.85 },
  { keywords: /(?:autorizaci[oó]n\s+(?:de\s+)?(?:salud|m[eé]dica)|health\s+authorization)/i, intent: 'autorizacion_salud', confidence: 0.85 },
  { keywords: /(?:cuadro\s+m[eé]dico|medical\s+network|red\s+m[eé]dica)/i, intent: 'consulta_red_medica', confidence: 0.85 },
  { keywords: /(?:condiciones?\s+(?:del?\s+)?producto|product\s+conditions|condiciones\s+generales)/i, intent: 'consulta_condiciones_producto', confidence: 0.8 },
  { keywords: /(?:mi\s+agente|my\s+agent|contacto\s+(?:del?\s+)?agente|agent\s+contact)/i, intent: 'consulta_agente', confidence: 0.8 },
  { keywords: /(?:flota|fleet|veh[ií]culos?\s+(?:de\s+(?:la\s+)?)?empresa)/i, intent: 'consulta_flota', empresaIntent: 'consulta_flota', confidence: 0.8 },
  { keywords: /(?:cobertura\s+(?:de\s+)?empleados|employee\s+coverage)/i, intent: 'consulta_cobertura_empleados', confidence: 0.8 },
  { keywords: /(?:agentes?\s+(?:del?\s+)?territorio|territory\s+agents)/i, intent: 'consulta_agentes_territorio', confidence: 0.85 },
  { keywords: /(?:producci[oó]n\s+(?:del?\s+)?territorio|territory\s+production)/i, intent: 'consulta_produccion_territorio', confidence: 0.85 },
  { keywords: /(?:kpi\s+(?:del?\s+)?territorio|territory\s+kpi|indicadores?\s+(?:del?\s+)?territorio)/i, intent: 'consulta_kpi_territorio', confidence: 0.85 },
  { keywords: /(?:foto|photo|imagen|image).*(?:siniestro|claim|da[nñ]o|damage)/i, intent: 'consulta_fotos_siniestro', confidence: 0.8 },

  // ── Single-keyword domain queries ──
  { keywords: /(?:cobertura|coverage|qu[eé]\s+cubre|what.*cover)/i, intent: 'consulta_cobertura', confidence: 0.75 },
  { keywords: /(?:comisi[oó]n|commission|comisiones|liquidaci[oó]n)/i, intent: 'consulta_comision', brokerIntent: 'consulta_comisiones_corredor', confidence: 0.8 },
  { keywords: /(?:producci[oó]n|production|cifras?\s+(?:de\s+)?venta)/i, intent: 'consulta_produccion', confidence: 0.75 },
  { keywords: /(?:renovaci[oó]n|renewal|vencimiento|expiration)/i, intent: 'consulta_renovacion', confidence: 0.8 },
  { keywords: /(?:kpi|indicador|objetivo|metric|rendimiento|performance)/i, intent: 'consulta_kpi', confidence: 0.7 },
  {
    keywords: /(?:recibo|receipt|pago|payment|factura|invoice)/i,
    intent: 'consulta_recibo',
    clientIntent: 'consulta_mis_recibos',
    confidence: 0.8,
  },
  {
    keywords: /(?:p[oó]liza|policy|seguro|insurance)/i,
    intent: 'consulta_poliza',
    clientIntent: 'consulta_mis_polizas',
    empresaIntent: 'consulta_polizas_empresa',
    agencyEmployeeIntent: 'consulta_polizas_agencia',
    brokerIntent: 'consulta_polizas_corredor',
    confidence: 0.75,
  },
  {
    keywords: /(?:siniestro|claim|parte|reclamaci[oó]n)/i,
    intent: 'consulta_siniestro',
    clientIntent: 'consulta_mis_siniestros',
    empresaIntent: 'consulta_siniestros_empresa',
    agencyEmployeeIntent: 'consulta_siniestros_agencia',
    brokerIntent: 'consulta_siniestros_corredor',
    confidence: 0.75,
  },
  {
    keywords: /(?:cliente|client|asegurado|policyholder|tomador)/i,
    intent: 'consulta_cliente',
    agencyEmployeeIntent: 'consulta_clientes_agencia',
    brokerIntent: 'consulta_clientes_corredor',
    confidence: 0.7,
  },
];

/**
 * Intent classifier + scope validator (Subcapa 1D).
 *
 * Keyword-based classification with role-aware intent routing.
 * Maps detected intent to required scope and validates against JWT claims.
 */
@Injectable()
export class IntentService {
  /**
   * Classify user query into an intent based on keywords.
   * Role is used to select the correct role-specific intent variant.
   */
  classify(query: string, role: Role): IntentResult {
    const text = query.toLowerCase();

    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.test(text)) {
        let intent = rule.intent;

        // Role-specific intent overrides
        if (EMPRESA_ROLES.has(role) && rule.empresaIntent) {
          intent = rule.empresaIntent;
        } else if (CLIENT_ROLES.has(role) && rule.clientIntent) {
          intent = rule.clientIntent;
        } else if (AGENCY_EMPLOYEE_ROLES.has(role) && rule.agencyEmployeeIntent) {
          intent = rule.agencyEmployeeIntent;
        } else if (BROKER_ROLES.has(role) && rule.brokerIntent) {
          intent = rule.brokerIntent;
        }

        return { intent, confidence: rule.confidence };
      }
    }

    return { intent: 'general_conversation', confidence: 0.3 };
  }

  /**
   * Validate that the user has the required scope for the detected intent.
   * Returns allowed=false if:
   *  - Intent maps to null (always blocked)
   *  - User's JWT scopes do not include the required scope
   */
  validate(query: string, claims: JwtAccessClaims): IntentValidation {
    const { intent } = this.classify(query, claims.role);
    const scopeOrNull = INTENT_SCOPE_MAP[intent];

    // Always-blocked intents
    if (scopeOrNull === null) {
      return {
        allowed: false,
        intent,
        reason: 'Intent bloqueado por política de seguridad',
      };
    }

    // General conversation — always allowed, no scope required
    if (scopeOrNull === ALLOW_ALL || scopeOrNull === undefined) {
      return { allowed: true, intent };
    }

    // Scope check against JWT claims
    const requiredScope = scopeOrNull as Scope;
    const userScopes: readonly Scope[] = claims.scopes ?? ROLE_SCOPES[claims.role] ?? [];
    const allowed = userScopes.includes(requiredScope);

    if (!allowed) {
      return {
        allowed: false,
        intent,
        requiredScope,
        reason: `Rol ${claims.role} no tiene el scope requerido: ${requiredScope}`,
      };
    }

    return { allowed: true, intent, requiredScope };
  }
}
