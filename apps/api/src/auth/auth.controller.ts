import { Controller, Post, Body, Req, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { Request } from 'express';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  mfaCode: z.string().length(6).optional(),
  deviceFingerprint: z.string().min(16),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
  deviceFingerprint: z.string().min(16),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request) {
    const dto = LoginSchema.parse(body);
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';
    const ua = req.headers['user-agent'] || 'unknown';

    return this.auth.login(dto.email, dto.password, dto.mfaCode, ip, ua, dto.deviceFingerprint);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown, @Req() req: Request) {
    const dto = RefreshSchema.parse(body);
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';
    const ua = req.headers['user-agent'] || 'unknown';

    return this.auth.refresh(dto.refreshToken, ip, ua, dto.deviceFingerprint);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request) {
    const claims = (req as any).user;
    if (claims?.jti) {
      await this.auth.logout(claims.jti);
    }
  }
}
