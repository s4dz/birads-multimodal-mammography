import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/app-error';
import { requireAdmin } from '@/lib/auth';
import { listAdminCases } from '@/lib/db-repository';

export const dynamic = 'force-dynamic';

/** GET /api/admin/cases — every case with its assignment/decision snapshot. */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
    return NextResponse.json({ ok: true, cases: listAdminCases() });
  } catch (error) {
    return toErrorResponse(error);
  }
}