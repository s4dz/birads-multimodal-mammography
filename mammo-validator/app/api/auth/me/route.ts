import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/app-error';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** GET /api/auth/me — the current authenticated user, or 401. */
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    return toErrorResponse(error);
  }
}