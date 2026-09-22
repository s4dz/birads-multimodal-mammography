import { NextRequest, NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import { requireAdmin } from '@/lib/auth';
import { setUserActive } from '@/lib/db-repository';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/users/:id — activate / deactivate a radiologist. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requireAdmin();
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError(400, 'Request body must be valid JSON.');
    }
    const { active } = (body ?? {}) as { active?: unknown };
    if (typeof active !== 'boolean') {
      throw new AppError(422, 'active (boolean) is required.');
    }
    setUserActive(id, active);
    return NextResponse.json({ ok: true, active });
  } catch (error) {
    return toErrorResponse(error);
  }
}