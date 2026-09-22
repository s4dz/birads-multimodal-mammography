import { cookies } from 'next/headers';
import { AppError } from './app-error';
import { getUserById } from './db-repository';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionToken,
} from './session';
import type { AppUser } from './types';

/**
 * Route-handler auth layer. Combines the stateless HMAC cookie (`./session`)
 * with an authoritative `users` lookup so deactivated accounts are rejected
 * even when their cookie is still cryptographically valid.
 */

/** Returns the active session user, or null when unauthenticated. */
export async function sessionUser(): Promise<AppUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const user = getUserById(payload.sub);
  if (!user || !user.active) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    specialty: user.specialty,
    active: user.active,
    createdAt: user.createdAt,
  };
}

/** Guards a route: 401 when unauthenticated. */
export async function requireUser(): Promise<AppUser> {
  const user = await sessionUser();
  if (!user) throw new AppError(401, 'Authentication required.');
  return user;
}

/** Guards an admin route: 401 unauthenticated, 403 when not an admin. */
export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== 'admin') {
    throw new AppError(403, 'Administrator role required.');
  }
  return user;
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

export function persistSessionCookieOptions(maxAgeSeconds: number) {
  return sessionCookieOptions(maxAgeSeconds);
}

/** Fixed TTL for new sessions (must match the token itself). */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;