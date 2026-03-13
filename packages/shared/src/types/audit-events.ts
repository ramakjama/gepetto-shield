/**
 * GEPETTO SHIELD — Audit Event Types
 * Every interaction is logged with hash-chained integrity
 */

export enum AuditEventType {
  // Authentication
  AUTH_LOGIN = 'AUTH_LOGIN',
  AUTH_MFA_VERIFY = 'AUTH_MFA_VERIFY',
  AUTH_TOKEN_REFRESH = 'AUTH_TOKEN_REFRESH',
  AUTH_SESSION_END = 'AUTH_SESSION_END',
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_MFA_FAILED = 'AUTH_MFA_FAILED',
  AUTH_IP_MISMATCH = 'AUTH_IP_MISMATCH',
  AUTH_CONCURRENT = 'AUTH_CONCURRENT',

  // Query lifecycle
  QUERY_SUBMITTED = 'QUERY_SUBMITTED',
  QUERY_SANITIZED = 'QUERY_SANITIZED',
  QUERY_INTENT_CLASSIFIED = 'QUERY_INTENT_CLASSIFIED',
  QUERY_RAG_RETRIEVED = 'QUERY_RAG_RETRIEVED',
  QUERY_LLM_RESPONSE = 'QUERY_LLM_RESPONSE',
  QUERY_OUTPUT_VALIDATED = 'QUERY_OUTPUT_VALIDATED',
  QUERY_DELIVERED = 'QUERY_DELIVERED',

  // Security
  SEC_JAILBREAK_BLOCKED = 'SEC_JAILBREAK_BLOCKED',
  SEC_INTENT_BLOCKED = 'SEC_INTENT_BLOCKED',
  SEC_RATE_LIMITED = 'SEC_RATE_LIMITED',
  SEC_PII_REDACTED = 'SEC_PII_REDACTED',
  SEC_CROSS_TENANT = 'SEC_CROSS_TENANT',
  SEC_INDIRECT_INJECTION = 'SEC_INDIRECT_INJECTION',
  SEC_CANARY_BREACH = 'SEC_CANARY_BREACH',
  SEC_PROMPT_LEAK = 'SEC_PROMPT_LEAK',
  SEC_CONTEXT_TAMPERED = 'SEC_CONTEXT_TAMPERED',
  SEC_EMBEDDING_POISON = 'SEC_EMBEDDING_POISON',
  SEC_ANOMALY = 'SEC_ANOMALY',
  SEC_ACCOUNT_LOCKED = 'SEC_ACCOUNT_LOCKED',

  // System
  SYS_CIRCUIT_BREAKER_TRIPPED = 'SYS_CIRCUIT_BREAKER_TRIPPED',
  SYS_CIRCUIT_BREAKER_RESET = 'SYS_CIRCUIT_BREAKER_RESET',
  SYS_CANARY_DEPLOYED = 'SYS_CANARY_DEPLOYED',
  SYS_CANARY_ROTATED = 'SYS_CANARY_ROTATED',
  SYS_AUDIT_INTEGRITY_CHECK = 'SYS_AUDIT_INTEGRITY_CHECK',
}

export enum Severity {
  INFO = 'INFO',
  P3 = 'P3',   // Low — logged, no action
  P2 = 'P2',   // Medium — alert, review
  P1 = 'P1',   // High — alert, throttle, investigate
  P0 = 'P0',   // Critical — terminate, lock, notify security
}

export interface AuditEntry {
  id: string;
  userId?: string;
  eventType: AuditEventType;
  severity: Severity;
  queryHash?: string;
  responseHash?: string;
  intent?: string;
  jailbreakScore?: number;
  piiDetected: boolean;
  canaryCheck: boolean;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  prevHash?: string;
  hash: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
