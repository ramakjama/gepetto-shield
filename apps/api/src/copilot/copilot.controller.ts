import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { CopilotService } from './copilot.service';
import type { JwtAccessClaims } from '@gepetto-shield/shared';

interface CopilotQueryDto {
  query: string;
  conversationId?: string;
}

interface CopilotQueryResponse {
  response: string;
  intent: string;
  sources: string[];
  audit: { queryId: string };
}

@Controller('api/copilot')
export class CopilotController {
  constructor(private readonly copilot: CopilotService) {}

  /**
   * POST /api/copilot/query
   * Main copilot endpoint. Protected by global AuthGuard + RbacGuard.
   * No specific scope required — any authenticated user can query.
   * Intent-level authorization is enforced inside the pipeline.
   */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  async query(
    @Body() body: CopilotQueryDto,
    @Req() req: { user: JwtAccessClaims },
  ): Promise<CopilotQueryResponse> {
    return this.copilot.query(
      { query: body.query, conversationId: body.conversationId },
      req.user,
    );
  }
}
