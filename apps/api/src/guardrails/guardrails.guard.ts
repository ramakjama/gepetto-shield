import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtAccessClaims } from '@gepetto-shield/shared';
import { RateLimitService } from './rate-limit.service';
import { SanitizerService } from './sanitizer.service';
import { JailbreakService } from './jailbreak.service';
import { IntentService } from './intent.service';

@Injectable()
export class GuardrailsGuard implements CanActivate {
  private readonly logger = new Logger(GuardrailsGuard.name);

  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly sanitizerService: SanitizerService,
    private readonly jailbreakService: JailbreakService,
    private readonly intentService: IntentService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const claims: JwtAccessClaims | undefined = request.user;
    const query: string | undefined = request.body?.query;

    // Not a copilot query — skip guardrails
    if (!query || typeof query !== 'string') {
      return true;
    }

    if (!claims) {
      throw new HttpException(
        { code: 'UNAUTHENTICATED', message: 'Claims de usuario no encontradas' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // ── Step 1: Rate limit ─────────────────────────────────────────────
    const rateResult = await this.rateLimitService.check(claims.sub, claims.role);
    this.logger.debug(
      `[rate-limit] user=${claims.sub} role=${claims.role} allowed=${rateResult.allowed} remaining=${rateResult.remaining}/${rateResult.total}`,
    );

    if (!rateResult.allowed) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Límite de consultas excedido. Inténtalo de nuevo en unos segundos.',
          remaining: rateResult.remaining,
          retryAfterMs: rateResult.retryAfterMs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // ── Step 2: Sanitize ───────────────────────────────────────────────
    const { text: sanitizedText, audit: sanitizeAudit } =
      this.sanitizerService.sanitize(query);

    this.logger.debug(
      `[sanitize] original=${sanitizeAudit.originalLength} final=${sanitizeAudit.finalLength} ` +
      `invisible=${sanitizeAudit.invisibleCharsFound} homoglyphs=${sanitizeAudit.homoglyphsReplaced} ` +
      `base64=${sanitizeAudit.base64BlocksNeutralized} truncated=${sanitizeAudit.wasTruncated}`,
    );

    // Replace original query with sanitized version
    request.body.query = sanitizedText;
    request.body.__sanitizeAudit = sanitizeAudit;

    // ── Step 3: Jailbreak classification ───────────────────────────────
    const jailbreakResult = this.jailbreakService.classify(sanitizedText);
    this.logger.debug(
      `[jailbreak] blocked=${jailbreakResult.blocked} level=${jailbreakResult.level} ` +
      `confidence=${jailbreakResult.confidence} pattern=${jailbreakResult.pattern ?? 'none'}`,
    );

    if (jailbreakResult.blocked) {
      // Apply adaptive throttle for suspicious users
      await this.rateLimitService.adaptiveCheck(
        claims.sub,
        claims.role,
        jailbreakResult.confidence,
      );

      throw new HttpException(
        {
          code: 'JAILBREAK_BLOCKED',
          message: 'Consulta bloqueada por política de seguridad.',
          level: jailbreakResult.level,
          confidence: jailbreakResult.confidence,
          pattern: jailbreakResult.pattern,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // ── Step 4: Intent validation + scope check ────────────────────────
    const intentResult = this.intentService.validate(sanitizedText, claims);
    this.logger.debug(
      `[intent] intent=${intentResult.intent} allowed=${intentResult.allowed} ` +
      `scope=${intentResult.requiredScope ?? 'none'}`,
    );

    if (!intentResult.allowed) {
      throw new HttpException(
        {
          code: 'INTENT_BLOCKED',
          message: intentResult.reason ?? 'Acceso denegado para esta consulta.',
          intent: intentResult.intent,
          requiredScope: intentResult.requiredScope,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
