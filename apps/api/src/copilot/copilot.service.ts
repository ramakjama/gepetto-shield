import {
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { RateLimitService } from '../guardrails/rate-limit.service';
import { SanitizerService } from '../guardrails/sanitizer.service';
import { JailbreakService } from '../guardrails/jailbreak.service';
import { IntentService } from '../guardrails/intent.service';
import { ContextService } from '../context/context.service';
import { RagService } from '../rag/rag.service';
import { CopilotChunkSanitizerService } from './chunk-sanitizer.service';
import { CanaryService } from './canary.service';
import { SystemPromptService } from './system-prompt.service';
import { LlmService } from '../llm/llm.service';
import { OutputGuardService } from './output-guard.service';
import { AuditService } from './audit.service';
import { SystemCircuitBreakerService } from '../incident/circuit-breaker.service';
import type { JwtAccessClaims } from '@gepetto-shield/shared';
import { AuditEventType, Severity } from '@gepetto-shield/shared';

interface CopilotInput {
  query: string;
  conversationId?: string;
}

interface CopilotResult {
  response: string;
  intent: string;
  sources: string[];
  audit: { queryId: string };
}

/**
 * COPILOT OCCIDENT — Main Query Pipeline
 *
 * 13-step secure pipeline:
 * 1.  Rate limit         8.  Canary injection
 * 2.  Input sanitize     9.  System prompt build
 * 3.  Jailbreak check    10. Context formatting
 * 4.  Intent classify    11. LLM call
 * 5.  Context signing    12. Output validation
 * 6.  RAG retrieval      13. Audit logging
 * 7.  Chunk sanitize
 */
@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  private readonly MIN_LATENCY_MS = 500; // Anti timing-attack padding

  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly sanitizerService: SanitizerService,
    private readonly jailbreakService: JailbreakService,
    private readonly intentService: IntentService,
    private readonly contextService: ContextService,
    private readonly ragService: RagService,
    private readonly chunkSanitizer: CopilotChunkSanitizerService,
    private readonly canaryService: CanaryService,
    private readonly systemPromptService: SystemPromptService,
    private readonly llmService: LlmService,
    private readonly outputGuard: OutputGuardService,
    private readonly auditService: AuditService,
    private readonly circuitBreaker: SystemCircuitBreakerService,
  ) {}

  async query(input: CopilotInput, claims: JwtAccessClaims): Promise<CopilotResult> {
    const queryId = crypto.randomUUID();
    const startTime = Date.now();
    let sanitized = '';
    let intentName = 'unknown';

    try {
      // ── Step 0: Circuit breaker guard — reject if system is offline ──
      await this.circuitBreaker.guard();

      // ── Step 1: Rate limit check ──
      const rateResult = await this.rateLimitService.check(claims.sub, claims.role);
      if (!rateResult.allowed) {
        throw new ForbiddenException('Límite de consultas excedido.');
      }

      // ── Step 2: Sanitize input (NFKC, homoglyphs, invisibles, base64) ──
      const sanitizeResult = this.sanitizerService.sanitize(input.query);
      sanitized = sanitizeResult.text;
      this.logger.debug(`[${queryId}] Input sanitized (${sanitized.length} chars)`);

      // ── Step 3: Jailbreak classification (4-level: regex, density, semantic, domain) ──
      const jailbreakResult = this.jailbreakService.classify(sanitized);
      if (jailbreakResult.blocked) {
        await this.auditService.log({
          queryId,
          userId: claims.sub,
          eventType: AuditEventType.SEC_JAILBREAK_BLOCKED,
          severity: Severity.P1,
          queryHash: this.hashText(sanitized),
          jailbreakScore: jailbreakResult.confidence,
          intent: 'blocked',
          piiDetected: false,
          canaryCheck: true,
          latencyMs: Date.now() - startTime,
          metadata: {
            pattern: jailbreakResult.pattern,
            details: jailbreakResult.details,
            level: jailbreakResult.level,
          },
        });
        await this.padLatency(startTime);
        throw new ForbiddenException(
          'Consulta bloqueada por motivos de seguridad.',
        );
      }

      // ── Step 4: Intent classification + scope validation ──
      const intentValidation = this.intentService.validate(sanitized, claims);
      intentName = intentValidation.intent;
      if (!intentValidation.allowed) {
        await this.auditService.log({
          queryId,
          userId: claims.sub,
          eventType: AuditEventType.SEC_INTENT_BLOCKED,
          severity: Severity.P2,
          queryHash: this.hashText(sanitized),
          jailbreakScore: 0,
          intent: intentName,
          piiDetected: false,
          canaryCheck: true,
          latencyMs: Date.now() - startTime,
          metadata: { reason: intentValidation.reason },
        });
        throw new ForbiddenException(
          intentValidation.reason ?? 'Acceso denegado para esta consulta.',
        );
      }

      this.logger.debug(
        `[${queryId}] Intent: ${intentName}`,
      );

      // ── Step 5: Build signed context (HMAC-SHA256 + nonce + timestamp) ──
      const signedContext = await this.contextService.sign(claims, claims.jti);
      const contextValid = await this.contextService.verify(signedContext);
      if (!contextValid) {
        throw new ForbiddenException('Context signature verification failed');
      }

      // ── Step 6: Retrieve RAG chunks with tenant isolation ──
      // Embedding placeholder — in production, call the embedding model
      const queryEmbedding = new Array(1536).fill(0) as number[];
      const rawChunks = await this.ragService.retrieve(queryEmbedding, claims, {
        topK: 10,
        minScore: 0.65,
      });

      this.logger.debug(`[${queryId}] RAG retrieved ${rawChunks.length} chunks`);

      // ── Step 7: Sanitize chunks for indirect injection ──
      const sanitizedChunks = await this.chunkSanitizer.sanitize(rawChunks, claims.orgId);

      // ── Step 8: Inject canary tokens into chunks ──
      const canaryChunks = await this.canaryService.inject(sanitizedChunks, claims.orgId);

      // ── Step 9: Build hardened system prompt per role ──
      const systemPrompt = this.systemPromptService.build(
        claims.role,
        claims.dataClearance,
      );

      // ── Step 10: Format context string from verified chunks ──
      const contextString = canaryChunks.length > 0
        ? canaryChunks
            .map((c) => `\u00abDATO_VERIFICADO\u00bb\n${c.content}\n\u00abDATO_VERIFICADO\u00bb`)
            .join('\n\n')
        : '';

      // ── Step 11: Call LLM (multi-provider with circuit breaker) ──
      const llmResponse = await this.llmService.chat(
        systemPrompt,
        sanitized,
        contextString || undefined,
      );

      this.logger.debug(
        `[${queryId}] LLM responded (${llmResponse.tokensOut} tokens, ${llmResponse.latencyMs}ms)`,
      );

      // ── Step 12: Validate output (PII redaction, canary check, prompt leak) ──
      const outputValidation = await this.outputGuard.validate(
        llmResponse.content,
        claims,
      );

      if (outputValidation.blocked) {
        // If canary breached → trip system circuit breaker (P0 CRITICAL)
        if (outputValidation.canaryBreached) {
          await this.circuitBreaker.trip(
            `Canary breach detected in query ${queryId}`,
            claims.sub,
          );
        }

        await this.auditService.log({
          queryId,
          userId: claims.sub,
          eventType: outputValidation.canaryBreached
            ? AuditEventType.SEC_CANARY_BREACH
            : AuditEventType.SEC_PROMPT_LEAK,
          severity: Severity.P0,
          queryHash: this.hashText(sanitized),
          responseHash: this.hashText(llmResponse.content),
          jailbreakScore: 0,
          intent: intentName,
          piiDetected: outputValidation.piiDetected,
          canaryCheck: outputValidation.canaryBreached,
          latencyMs: Date.now() - startTime,
          tokensIn: llmResponse.tokensIn,
          tokensOut: llmResponse.tokensOut,
          metadata: { reason: outputValidation.reason },
        });
        await this.padLatency(startTime);
        throw new ForbiddenException(
          'La respuesta ha sido bloqueada por contener datos no autorizados.',
        );
      }

      // ── Step 13: Audit the entire interaction ──
      const sources = sanitizedChunks.map((c) => c.source);

      await this.auditService.log({
        queryId,
        userId: claims.sub,
        eventType: AuditEventType.QUERY_DELIVERED,
        severity: Severity.INFO,
        queryHash: this.hashText(sanitized),
        responseHash: this.hashText(outputValidation.sanitizedContent),
        jailbreakScore: 0,
        intent: intentName,
        piiDetected: outputValidation.piiDetected,
        canaryCheck: true,
        latencyMs: Date.now() - startTime,
        tokensIn: llmResponse.tokensIn,
        tokensOut: llmResponse.tokensOut,
        metadata: {
          conversationId: input.conversationId,
          chunksRetrieved: rawChunks.length,
          chunksAfterSanitize: sanitizedChunks.length,
          provider: llmResponse.provider,
          intentValidated: true,
          contextSigned: !!signedContext.sig,
        },
      });

      await this.padLatency(startTime);

      return {
        response: outputValidation.sanitizedContent,
        intent: intentName,
        sources,
        audit: { queryId },
      };
    } catch (err) {
      // Audit unhandled errors (skip if we already audited jailbreak/output blocks)
      const msg = err instanceof ForbiddenException ? err.message : '';
      const alreadyAudited =
        msg === 'Consulta bloqueada por motivos de seguridad.' ||
        msg === 'La respuesta ha sido bloqueada por contener datos no autorizados.' ||
        msg === 'Context signature verification failed';

      if (!alreadyAudited) {
        await this.auditService.log({
          queryId,
          userId: claims.sub,
          eventType: AuditEventType.SEC_ANOMALY,
          severity: Severity.P2,
          queryHash: sanitized ? this.hashText(sanitized) : undefined,
          jailbreakScore: 0,
          intent: intentName,
          piiDetected: false,
          canaryCheck: true,
          latencyMs: Date.now() - startTime,
          metadata: {
            error: (err as Error).message,
            stack: (err as Error).stack?.split('\n').slice(0, 3),
          },
        }).catch((auditErr) => {
          this.logger.error(`[${queryId}] Audit itself failed: ${auditErr}`);
        });
      }

      throw err;
    }
  }

  private hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
  }

  private async padLatency(startTime: number): Promise<void> {
    const elapsed = Date.now() - startTime;
    if (elapsed < this.MIN_LATENCY_MS) {
      await new Promise((resolve) => setTimeout(resolve, this.MIN_LATENCY_MS - elapsed));
    }
  }
}
