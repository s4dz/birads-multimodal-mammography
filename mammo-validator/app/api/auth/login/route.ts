import { NextRequest, NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import {
  SESSION_MAX_AGE_SECONDS,
  sessionCookieName,
} from '@/lib/auth';
import { getUserByUsername } from '@/lib/db-repository';
import { assertNotLocked, registerFailure, resetFailures } from '@/lib/rate-limit';
import {
  sessionCookieOptions,
  signSessionToken,
  verifyPassword,
} from '@/lib/session';

export const dynamic = 'force-dynamic';

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  return forwarded || realIp || 'unknown';
}

/** POST /api/auth/login — authenticate and set the session cookie. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ipKey = `ip:${clientIp(request)}`;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return toErrorResponse(
      new AppError(400, 'Request body must be valid JSON.')
    );
  }
  const { username, password } = (body ?? {}) as {
    username?: unknown;
    password?: unknown;
  };
  if (typeof username !== 'string' || typeof password !== 'string') {
    return toErrorResponse(
      new AppError(422, 'username and password are required.')
    );
  }

  const usernameKey = `user:${username.trim().toLowerCase()}`;
  try {
    assertNotLocked(ipKey);
    assertNotLocked(usernameKey);
  } catch (error) {
    return toErrorResponse(error instanceof AppError ? error : new AppError(429, 'Too many failed attempts.'));
  }

  const user = getUserByUsername(username.trim());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    registerFailure(ipKey);
    registerFailure(usernameKey);
    return toErrorResponse(
      new AppError(401, 'Invalid username or password.')
    );
  }
  if (!user.active) {
    return toErrorResponse(
      new AppError(
        403,
        'This account has been deactivated. Contact an administrator.'
      )
    );
  }

  const token = signSessionToken(user.id, user.role);
  resetFailures(ipKey);
  resetFailures(usernameKey);
  const response = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      specialty: user.specialty,
      active: user.active,
      createdAt: user.createdAt,
    },
  });
  response.cookies.set(
    sessionCookieName(),
    token,
    sessionCookieOptions(SESSION_MAX_AGE_SECONDS)
  );
  return response;
}