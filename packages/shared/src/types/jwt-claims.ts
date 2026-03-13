import { Role, Channel, LegacyBrand, DataClearance } from './roles';
import { Scope } from './scopes';

/**
 * COPILOT OCCIDENT — JWT Token Claims
 * RS256 signed, 15min access, 8h refresh with rotation
 */

export interface JwtAccessClaims {
  // Standard claims
  iss: 'gepetto-shield-auth';
  sub: string;           // User ID (e.g., "AGT-28491")
  iat: number;
  exp: number;
  jti: string;           // Unique token ID (anti-replay)

  // Identity
  role: Role;
  channel: Channel;
  scopes: Scope[];

  // Organization
  orgId: string;         // Agency/brokerage/department ID
  orgDisplay: string;    // Human-readable org name
  territory?: string;
  department?: string;
  legacyBrand?: LegacyBrand;

  // Security
  mfaVerified: boolean;
  authTime: number;      // When MFA was last verified
  dataClearance: DataClearance;
  maxConcurrentSessions: number;

  // Binding (anti-hijacking)
  ipHash: string;        // SHA256(IP)[:16]
  uaHash: string;        // SHA256(User-Agent)[:16]
  deviceFingerprint: string;
}

export interface JwtRefreshClaims {
  iss: 'gepetto-shield-auth';
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  sessionId: string;
}

export interface SignedContext {
  ctx: {
    agentId: string;
    role: Role;
    channel: Channel;
    orgId: string;
    orgDisplay: string;
    territory?: string;
    department?: string;
    scopes: Scope[];
    dataClearance: DataClearance;
    sessionId: string;
    timestamp: number;
    nonce: string;
  };
  sig: string;
  alg: 'HMAC-SHA256';
}
