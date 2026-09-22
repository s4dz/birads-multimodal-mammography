import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/app-error';
import { requireAdmin } from '@/lib/auth';
import { listRadiologistWorkloads } from '@/lib/db-repository';

export const dynamic = 'force-dynamic';

/** GET /api/admin/assignments/stats — per-radiologist workload counts. */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
    return NextResponse.json({ ok: true, workloads: listRadiologistWorkloads() });
  } catch (error) {
    return toErrorResponse(error);
  }
}