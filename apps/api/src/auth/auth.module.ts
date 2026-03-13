import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { MfaService } from './mfa.service';
import { TokenBindingService } from './token-binding.service';
import { SessionService } from './session.service';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    MfaService,
    TokenBindingService,
    SessionService,
    PrismaService,
    RedisService,
  ],
  exports: [AuthService, AuthGuard, SessionService, TokenBindingService],
})
export class AuthModule {}
