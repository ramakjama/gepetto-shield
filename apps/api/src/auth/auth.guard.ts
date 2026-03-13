import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { TokenBindingService } from './token-binding.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly tokenBinding: TokenBindingService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip auth for @Public() endpoints
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token requerido');
    }

    const token = authHeader.slice(7);
    const claims = await this.auth.verifyAccessToken(token);

    // Verify token binding (IP + UA + device)
    const ip = (request.headers['x-forwarded-for'] as string) || request.ip || '0.0.0.0';
    const ua = request.headers['user-agent'] || 'unknown';
    const currentIpHash = this.tokenBinding.hashIp(ip);
    const currentUaHash = this.tokenBinding.hashUa(ua);

    if (claims.ipHash !== currentIpHash || claims.uaHash !== currentUaHash) {
      throw new UnauthorizedException('Token binding mismatch — acceso denegado');
    }

    // Attach claims to request
    request.user = claims;
    return true;
  }
}
