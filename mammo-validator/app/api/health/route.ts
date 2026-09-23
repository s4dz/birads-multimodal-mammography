import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/health — minimal liveness probe for load balancers / orchestrators.
 *
 * Intentionally returns no database state, no environment details, no model
 * or path information: just a tiny JSON object that proves the Node process is
 * serving requests. Requires no authentication.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}
