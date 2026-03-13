import { Injectable, Logger } from '@nestjs/common';

export interface JailbreakResult {
  blocked: boolean;
  level: string;
  confidence: number;
  pattern?: string;
  details?: string;
}

export interface LlmClassifier {
  classify(text: string): Promise<{ blocked: boolean; score: number; category?: string }>;
}

interface PatternEntry {
  name: string;
  re: RegExp;
}

/**
 * 4-level jailbreak classifier for Gepetto Shield.
 *
 * Level 1: Regex patterns (~45 patterns, ES + EN + multi-language)
 * Level 2: Manipulation keyword density analysis (>15% = block)
 * Level 3: External LLM classifier placeholder (LlamaGuard / Azure Content Safety)
 * Level 4: Domain-specific insurance manipulation patterns
 */
@Injectable()
export class JailbreakService {
  private readonly logger = new Logger(JailbreakService.name);

  // ── Level 1: Regex patterns ──────────────────────────────────────────

  private readonly patterns: PatternEntry[] = [
    // ─── (a) Identity attacks — Spanish ───
    { name: 'identity_es_nuevo_asistente', re: /eres\s+(?:ahora\s+)?(?:un\s+)?(?:nuevo\s+)?(?:asistente|bot|ia|modelo)/i },
    { name: 'identity_es_actua_como', re: /act[uú]a\s+como\s+(?:si|otro|un)/i },
    { name: 'identity_es_finge_ser', re: /finge\s+(?:ser|que\s+eres)/i },
    { name: 'identity_es_nuevo_rol', re: /tu\s+nuevo\s+rol\s+(?:es|ser[aá])/i },
    { name: 'identity_es_olvida_instrucciones', re: /olvida\s+(?:tus|todas?\s+(?:las\s+)?)?instrucciones/i },
    { name: 'identity_es_olvida_todo', re: /olvida\s+todo\s+lo\s+que/i },
    { name: 'identity_es_ignora_anterior', re: /ignora\s+(?:lo\s+anterior|todo(?:s|as)?\s+l(?:o|as)\s+(?:previo|anterior|instrucciones)|las?\s+instrucciones)/i },
    { name: 'identity_es_resetea', re: /(?:resetea|reinicia)\s+tu\s+(?:personalidad|comportamiento|instrucciones)/i },
    { name: 'identity_es_nuevas_instrucciones', re: /nuevas?\s+instrucciones/i },
    { name: 'identity_es_sin_restricciones', re: /sin\s+(?:restricciones|reglas|l[ií]mites)/i },
    // ─── (a) Identity attacks — English ───
    { name: 'identity_en_you_are_now', re: /you\s+are\s+now\s+(?:a\s+)?/i },
    { name: 'identity_en_pretend', re: /pretend\s+(?:you\s+are|to\s+be|you['']?re)/i },
    { name: 'identity_en_your_new_role', re: /your\s+new\s+role\s+is/i },
    { name: 'identity_en_forget_everything', re: /forget\s+(?:everything|all|your\s+instructions|previous\s+instructions)/i },
    { name: 'identity_en_ignore_previous', re: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)/i },
    { name: 'identity_en_reset_personality', re: /reset\s+your\s+(?:personality|behavior|instructions)/i },
    { name: 'identity_en_act_as', re: /act\s+as\s+(?:if\s+you|a\s*n?\s+(?:admin|different|root|superuser))/i },
    { name: 'identity_en_new_instructions', re: /new\s+instructions?\s*:/i },
    { name: 'identity_en_no_rules', re: /(?:no|without|with\s+no)\s+rules/i },

    // ─── (b) Instruction override ───
    { name: 'override_system_prompt_tag', re: /(?:^|\n)\s*(?:system|SYSTEM)\s*(?:PROMPT)?:/i },
    { name: 'override_inst_header', re: /###\s*(?:Instruction|System|Human)/i },
    { name: 'override_inst_bracket', re: /\[INST\]/i },
    { name: 'override_sys_bracket', re: /<<\s*SYS\s*>>/i },
    { name: 'override_es_nueva_instruccion', re: /nueva\s+instrucci[oó]n/i },
    { name: 'override_es_anula', re: /anula\s+(?:las?\s+)?(?:instrucciones|restricciones|reglas|seguridad)/i },
    { name: 'override_es_desactiva', re: /desactiva\s+(?:la\s+)?(?:seguridad|restricciones|filtros|protecci[oó]n)/i },
    { name: 'override_es_modo_dev', re: /modo\s+(?:desarrollador|developer|DAN|sin\s+restricciones|ilimitado|debug)/i },
    { name: 'override_en_dev_mode', re: /(?:developer|DAN|jailbreak|unrestricted|god)\s+mode/i },
    { name: 'override_en_disable_safety', re: /disable\s+(?:safety|security|filters|restrictions|guardrails)/i },
    { name: 'override_en_new_instruction', re: /(?:new|override)\s+instruction/i },

    // ─── (c) Cross-tenant access ───
    { name: 'tenant_es_datos_otro', re: /(?:accede|acceder|dame|muestra|ense[nñ]a)\s+(?:los?\s+)?datos?\s+de\s+otr[oa]/i },
    { name: 'tenant_es_polizas_otro', re: /(?:muestra|dame|ver)\s+(?:las?\s+)?p[oó]lizas?\s+de\s+otr[oa]/i },
    { name: 'tenant_es_datos_agencia', re: /dame\s+(?:los?\s+)?datos?\s+de\s+(?:la\s+)?(?:otra\s+)?agencia/i },
    { name: 'tenant_es_cambia_tenant', re: /(?:cambia|cambiar|salta|saltar|bypass)\s+(?:el\s+|mi\s+)?tenant/i },
    { name: 'tenant_es_soy_agente', re: /soy\s+(?:el\s+)?agente\s+\w/i },
    { name: 'tenant_es_como_agente', re: /como\s+(?:si\s+)?fuera\s+(?:el\s+)?agente/i },
    { name: 'tenant_en_other_tenant', re: /(?:access|show|get|read)\s+(?:other|another)\s+tenant/i },
    { name: 'tenant_en_other_data', re: /(?:show|get|read)\s+other.*?(?:policies|claims|clients|data)/i },
    { name: 'tenant_en_another_agent', re: /(?:from|of)\s+another\s+(?:agent|broker|mediador)/i },
    { name: 'tenant_en_all_agents', re: /all\s+(?:agent|broker|mediador)\s+data/i },
    { name: 'tenant_en_switch_tenant', re: /(?:switch|change|bypass)\s+tenant/i },
    { name: 'tenant_es_codigo_agente', re: /(?:mi\s+)?c[oó]digo\s+(?:de\s+)?agente\s+(?:es|ser[aá])\s+\w/i },
    { name: 'tenant_es_clientes_del_agente', re: /clientes?\s+del?\s+(?:otro\s+)?agente/i },
    { name: 'tenant_es_datos_otros_agentes', re: /datos?\s+de\s+otros?\s+agentes?/i },
    { name: 'tenant_es_todos_clientes', re: /todos?\s+los?\s+clientes?\s+de\s+la/i },
    { name: 'tenant_en_every_all_clients', re: /(?:every|all)\s+clients?\s+(?:in|from|of)\s+the/i },
    { name: 'tenant_en_all_agent_data', re: /all\s+agent\s+data/i },
    { name: 'tenant_en_all_commission_data', re: /all\s+commission\s+data/i },
    { name: 'tenant_es_dame_todos_datos', re: /(?:dame|muestra|ver)\s+todos?\s+los?\s+datos/i },
    { name: 'tenant_es_base_datos', re: /(?:de|en)\s+la\s+base\s+de\s+datos/i },

    // ─── (d) System prompt extraction ───
    { name: 'extract_es_repite_prompt', re: /(?:repite|muestra|dime|revela|imprime)\s+(?:tu\s+|el\s+)?(?:system\s+)?prompt/i },
    { name: 'extract_es_instrucciones', re: /(?:repite|muestra|dime|revela|cu[aá]l(?:es)?)\s+(?:son\s+)?(?:tus\s+)?instrucciones/i },
    { name: 'extract_es_configuracion', re: /(?:revela|muestra|dime)\s+tu\s+configuraci[oó]n/i },
    { name: 'extract_es_reglas', re: /(?:imprime|muestra|dime|cu[aá]l(?:es)?)\s+(?:son\s+)?(?:tus\s+)?reglas/i },
    { name: 'extract_es_prompt_sistema', re: /prompt\s+del\s+sistema/i },
    { name: 'extract_en_system_prompt', re: /(?:repeat|show|print|reveal|display)\s+(?:your\s+|the\s+)?system\s+prompt/i },
    { name: 'extract_en_instructions', re: /(?:show|tell|reveal)\s+(?:me\s+)?your\s+(?:instructions|rules|configuration|constraints)/i },
    { name: 'extract_en_what_prompt', re: /what\s+(?:is|are)\s+your\s+(?:system\s+)?(?:prompt|instructions|rules|constraints)/i },
    { name: 'extract_system_prompt_bare', re: /system\s*prompt/i },

    // ─── (e) Social engineering ───
    { name: 'social_es_emergencia', re: /(?:emergencia\s+m[eé]dica|es\s+una?\s+emergencia|vida\s+en\s+peligro)/i },
    { name: 'social_es_hijo_peligro', re: /mi\s+hijo\s+(?:est[aá]\s+en\s+peligro|se\s+(?:muere|va\s+a\s+morir))/i },
    { name: 'social_es_alguien_morira', re: /alguien\s+(?:morir[aá]|va\s+a\s+morir)/i },
    { name: 'social_es_prueba_autorizada', re: /(?:esto\s+es\s+una?\s+)?prueba\s+autorizada/i },
    { name: 'social_es_soy_admin', re: /soy\s+(?:el\s+)?(?:administrador|admin|root|superusuario)/i },
    { name: 'social_es_soy_it', re: /soy\s+de\s+(?:IT|sistemas|seguridad|soporte)/i },
    { name: 'social_es_autorizacion', re: /(?:tengo|mi\s+jefe\s+me\s+(?:dio|autoriz[oó]))\s+autorizaci[oó]n\s+especial/i },
    { name: 'social_es_companero', re: /mi\s+compa[nñ]ero\s+me\s+(?:dijo|pidi[oó])/i },
    { name: 'social_en_emergency', re: /(?:medical\s+emergency|someone\s+will\s+die|life\s+(?:is\s+)?in\s+danger)/i },
    { name: 'social_en_authorized_test', re: /(?:this\s+is\s+an?\s+)?authorized\s+(?:test|pentest|audit)/i },
    { name: 'social_en_i_am_admin', re: /i\s+am\s+(?:the\s+)?(?:admin|administrator|root|superuser)/i },
    { name: 'social_en_special_clearance', re: /i\s+have\s+(?:special|elevated)\s+(?:clearance|authorization|access)/i },
    { name: 'social_en_boss_authorized', re: /my\s+(?:boss|manager|supervisor|colleague)\s+(?:authorized|asked|told)/i },
    { name: 'social_es_urgente_seguridad', re: /urgente.*(?:verificaci[oó]n|acceso\s+completo|seguridad)/i },
    { name: 'social_en_security_check', re: /security\s+(?:check|verification|audit)/i },
    { name: 'social_es_auditoria', re: /(?:estamos\s+haciendo|realizar)\s+una?\s+auditor[ií]a/i },

    // ─── (f) Encoding evasion ───
    { name: 'evasion_base64_prefix', re: /base64\s*:/i },
    { name: 'evasion_eval_exec', re: /(?:eval|exec)\s*\(/i },
    { name: 'evasion_rot13', re: /rot13/i },
    { name: 'evasion_hex_prefix', re: /(?:^|\s)hex\s*:/i },
    { name: 'evasion_unicode_escape', re: /\\u00[0-9a-fA-F]{2}/i },
    { name: 'evasion_hex_escape', re: /\\x[0-9a-fA-F]{2}/i },
    { name: 'evasion_javascript', re: /javascript\s*:/i },
    { name: 'evasion_data_text', re: /data\s*:\s*text/i },
    { name: 'evasion_script_tag', re: /<\s*script/i },
    { name: 'evasion_event_handler', re: /\b(?:onerror|onload|onclick|onmouseover)\s*=/i },
    { name: 'evasion_sql_injection', re: /(?:SELECT\s+\*\s+FROM|DROP\s+TABLE|UNION\s+SELECT|;\s*DROP\s)/i },

    // ─── (g) Multi-language injection ───
    { name: 'multilang_french_ignore', re: /ignorez\s+(?:toutes?\s+)?(?:les?\s+)?instructions?/i },
    { name: 'multilang_german_ignore', re: /ignoriere?\s+(?:alle\s+)?(?:Anweisungen|Instruktionen)/i },
    { name: 'multilang_chinese_ignore', re: /\u5FFD\u7565/i },
    { name: 'multilang_japanese_ignore', re: /\u7121\u8996/i },
    { name: 'multilang_russian_ignore', re: /\u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0439/i },
    { name: 'multilang_arabic_ignore', re: /\u062A\u062C\u0627\u0647\u0644/i },
  ];

  // ── Level 2: Keyword density ─────────────────────────────────────────

  private readonly MANIPULATION_WORDS = new Set([
    'ignore', 'ignora', 'override', 'anula', 'bypass', 'salta',
    'pretend', 'finge', 'forget', 'olvida', 'system', 'prompt',
    'instruction', 'instruccion', 'instrucción', 'jailbreak', 'hack',
    'exploit', 'inject', 'inyecta', 'disable', 'desactiva',
    'unrestricted', 'unlimited', 'ilimitado',
    'confidential', 'confidencial', 'secret', 'secreto',
    'admin', 'root', 'sudo', 'superuser', 'developer', 'desarrollador',
    'debug', 'backdoor', 'malicious',
  ]);

  private readonly DENSITY_THRESHOLD = 0.15;

  // ── Level 3: LLM classifier placeholder ──────────────────────────────

  private llmClassifier: LlmClassifier | null = null;

  /**
   * Register an external LLM-based classifier (LlamaGuard, Azure Content Safety).
   * Call this from module initialization once the service is available.
   */
  setLlmClassifier(classifier: LlmClassifier): void {
    this.llmClassifier = classifier;
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Synchronous 4-level jailbreak classification.
   * Runs L1 (regex), L2 (density), L4 (domain). L3 (LLM) skipped in sync path.
   */
  classify(text: string): JailbreakResult {
    const l1 = this.checkLevel1(text);
    if (l1.blocked) return l1;

    const l2 = this.checkLevel2(text);
    if (l2.blocked) return l2;

    const l4 = this.checkLevel4(text);
    if (l4.blocked) return l4;

    return { blocked: false, level: 'PASS', confidence: 0.0 };
  }

  /**
   * Full async classification pipeline including L3 LLM classifier.
   */
  async classifyAsync(text: string): Promise<JailbreakResult> {
    const syncResult = this.classify(text);
    if (syncResult.blocked) return syncResult;

    // Level 3: LLM classifier
    if (this.llmClassifier) {
      try {
        const l3 = await this.llmClassifier.classify(text);
        if (l3.blocked) {
          return {
            blocked: true,
            level: 'L3_LLM',
            confidence: l3.score,
            details: `category: ${l3.category ?? 'unknown'}`,
          };
        }
      } catch (err) {
        this.logger.warn(`L3 LLM classifier error: ${err}`);
      }
    }

    return { blocked: false, level: 'PASS', confidence: 0.0 };
  }

  // ── Level implementations ────────────────────────────────────────────

  private checkLevel1(text: string): JailbreakResult {
    for (const { name, re } of this.patterns) {
      if (re.test(text)) {
        return {
          blocked: true,
          level: 'L1_REGEX',
          confidence: 0.95,
          pattern: name,
        };
      }
    }
    return { blocked: false, level: 'L1_REGEX', confidence: 0.0 };
  }

  private checkLevel2(text: string): JailbreakResult {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return { blocked: false, level: 'L2_DENSITY', confidence: 0.0 };
    }

    let manipCount = 0;
    for (const word of words) {
      if (this.MANIPULATION_WORDS.has(word)) {
        manipCount++;
      }
    }

    const ratio = manipCount / words.length;
    if (ratio > this.DENSITY_THRESHOLD) {
      return {
        blocked: true,
        level: 'L2_DENSITY',
        confidence: Math.min(ratio * 3, 1.0),
        details: `manipulation density: ${(ratio * 100).toFixed(1)}% (${manipCount}/${words.length} words)`,
      };
    }

    return { blocked: false, level: 'L2_DENSITY', confidence: ratio };
  }

  private checkLevel4(text: string): JailbreakResult {
    const domainPatterns: PatternEntry[] = [
      { name: 'domain_alter_claim_amount', re: /(?:modifica|cambia|altera)\s+(?:el\s+)?(?:importe|monto|valor)\s+(?:del?\s+)?(?:siniestro|p[oó]liza|reclamaci[oó]n)/i },
      { name: 'domain_delete_claim_record', re: /(?:elimina|borra|suprime)\s+(?:el\s+)?(?:registro|historial)\s+(?:del?\s+)?(?:siniestro|reclamaci[oó]n)/i },
      { name: 'domain_auto_approve', re: /(?:aprueba|autoriza)\s+(?:autom[aá]ticamente|sin\s+revisi[oó]n)/i },
      { name: 'domain_change_policy_status', re: /(?:cambia|modifica|anula)\s+(?:el\s+)?estado\s+de\s+(?:la\s+)?p[oó]liza/i },
      { name: 'domain_other_agent_commissions', re: /comisiones?\s+de(?:l)?\s+(?:otro|todos|dem[aá]s)/i },
      { name: 'domain_all_territory_claims', re: /siniestros?\s+de\s+(?:todas?\s+)?(?:las\s+)?territoriales?/i },
      { name: 'domain_other_agent_premiums', re: /primas?\s+de\s+(?:otros?\s+)?(?:agentes?|mediador)/i },
      { name: 'domain_export_all', re: /(?:exporta|descarga|dump)\s+(?:todos?\s+)?(?:los\s+)?datos/i },
    ];

    for (const { name, re } of domainPatterns) {
      if (re.test(text)) {
        return {
          blocked: true,
          level: 'L4_DOMAIN',
          confidence: 0.85,
          pattern: name,
          details: 'Domain-specific insurance manipulation attempt',
        };
      }
    }

    return { blocked: false, level: 'L4_DOMAIN', confidence: 0.0 };
  }
}
