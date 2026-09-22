import { NextResponse } from 'next/server';
import { sessionCookieName } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** POST /api/auth/logout — clear the session cookie. */
export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName(), '', { maxAge: 0, path: '/' });
  return response;
}