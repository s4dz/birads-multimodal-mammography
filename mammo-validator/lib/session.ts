import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { UserRole } from './types';

/**
 * Pure session primitives (HMAC-signed stateless cookie + scrypt password
 * hashing). This module must stay free of `next/headers` and SQLite imports so
 * it can be shared by the Next proxy (network boundary) and the route
 * handlers. Route handlers combine `verifySessionToken` with a DB lookup in
 * `./auth`.
 */

export const SESSION_COOKIE = 'mammoqa.session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Signing secret for session cookies: `MAMMO_AUTH_SECRET` when set, otherwise
 * a fixed development constant. Do NOT derive it from `process.cwd()` — the
 * Next proxy worker and the route handlers can run with different working
 * directories, which would silently break every session.
 *
 * Production is fail-closed: an unset secret aborts startup loudly instead of
 * silently signing sessions with the well-known dev constant.
 */
export function authSecret(): string {
  const provided = process.env.MAMMO_AUTH_SECRET;
  if (provided && provided.length > 0) return provided;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'MAMMO_AUTH_SECRET must be set in production. Generate one with: ' +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return 'mammoqa-dev-hmac-secret-v1';
}

/* ------------------------------------------------------------------ */
/* Session tokens                                                      */
/* ------------------------------------------------------------------ */

export interface SessionPayload {
  /** User id (`users.id`). */
  sub: string;
  role: UserRole;
  /** Epoch millis. */
  exp: number;
}

function signBody(body: string): string {
  return createHmac('sha256', authSecret()).update(body).digest('base64url');
}

export function signSessionToken(
  sub: string,
  role: UserRole,
  ttlMs: number = SESSION_TTL_MS
): string {
  const payload: SessionPayload = { sub, role, exp: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signBody(body)}`;
}

/** Returns the verified, unexpired payload or null when the token is bad. */
export function verifySessionToken(
  token: string | undefined | null
): SessionPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = Buffer.from(signBody(body), 'base64url');
  let signatureBuffer: Buffer;
  try {
    signatureBuffer = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (
    signatureBuffer.length !== expected.length ||
    !timingSafeEqual(signatureBuffer, expected)
  ) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const candidate = payload as Partial<SessionPayload>;
  if (
    typeof candidate.sub !== 'string' ||
    candidate.sub.length === 0 ||
    (candidate.role !== 'admin' && candidate.role !== 'radiologist') ||
    typeof candidate.exp !== 'number' ||
    candidate.exp < Date.now()
  ) {
    return null;
  }
  return candidate as SessionPayload;
}

export function sessionCookieOptions(maxAgeSeconds?: number): {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge?: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Password hashing (scrypt)                                           */
/* ------------------------------------------------------------------ */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  }).toString('hex');
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${hash}`;
}

export function verifyPassword(
  password: string,
  stored: string
): boolean {
  const parts = stored.split('$');
  if (
    parts.length !== 6 ||
    parts[0] !== 'scrypt' ||
    parts[1] === '' ||
    parts[2] === '' ||
    parts[3] === ''
  ) {
    return false;
  }
  const [, n, r, p, salt, expectedHex] = parts;
  const options = {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  };
  let actual: Buffer;
  let expected: Buffer;
  try {
    actual = scryptSync(password, salt, SCRYPT.keylen, options);
    expected = Buffer.from(expectedHex, 'hex');
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}