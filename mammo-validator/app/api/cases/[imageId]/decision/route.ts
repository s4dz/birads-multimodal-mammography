import { NextRequest, NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import { requireUser } from '@/lib/auth';
import { submitDecision } from '@/lib/decision-service';
import type { ValidationApiResponse, ValidationStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUSES = new Set<ValidationStatus>(['APPROVED', 'RELABELED']);

/**
 * POST /api/cases/:imageId/decision — record the session radiologist's
 * decision for an assigned case. The reviewer identity is always taken from
 * the backend session; a client-supplied identity is never trusted.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
): Promise<NextResponse> {
  try {
    const { imageId } = await params;
    const user = await requireUser();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError(400, 'Request body must be valid JSON.');
    }
    const { status, finalLabel, notes } = (body ?? {}) as {
      status?: unknown;
      finalLabel?: unknown;
      notes?: unknown;
    };
    if (typeof status !== 'string' || !STATUSES.has(status as ValidationStatus)) {
      throw new AppError(
        422,
        'status is required and must be APPROVED or RELABELED.'
      );
    }
    if (
      finalLabel !== undefined &&
      typeof finalLabel !== 'string'
    ) {
      throw new AppError(422, 'finalLabel must be a string when provided.');
    }
    if (notes !== undefined && typeof notes !== 'string') {
      throw new AppError(422, 'notes must be a string when provided.');
    }

    const record = submitDecision(user, imageId, {
      status: status as ValidationStatus,
      finalLabel: typeof finalLabel === 'string' ? finalLabel : undefined,
      notes: typeof notes === 'string' ? notes : undefined,
    });

    const payload: ValidationApiResponse = {
      ok: true,
      record,
      persistedCount: 1,
    };
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}