import { SetMetadata } from '@nestjs/common';
import type { Scope } from '@gepetto-shield/shared';

export const REQUIRED_SCOPES_KEY = 'requiredScopes';

/**
 * Require specific scopes to access an endpoint.
 * Deny-by-default: if a scope is not in the user's JWT, access is rejected.
 *
 * @example
 * @RequireScope('read:own_clients')
 * @Get('clients')
 * async getClients() { ... }
 */
export const RequireScope = (...scopes: Scope[]) =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);
