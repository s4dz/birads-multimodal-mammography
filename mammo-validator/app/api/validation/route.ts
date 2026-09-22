import { NextRequest, NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import { requireUser } from '@/lib/auth';
import { listDecisionsByRadiologist } from '@/lib/db-repository';
import { submitDecision } from '@/lib/decision-service';
import type { ValidationApiResponse, ValidationRecord } from '@/lib/types';
import { isValidationRecord } from '@/lib/validation-guards';

export const dynamic = 'force-dynamic';

/**
 * Legacy decision endpoint (kept for the existing client payload shape):
 * { imageId, radiologistId, originalLabel, finalLabel, status, notes, timestamp }.
 *
 * The reviewer identity and the original-label audit string are re-derived
 * from the backend session + stored case — the client-supplied values are
 * validated but not trusted for identity.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError(400, 'Request body must be valid JSON.');
    }
    if (!isValidationRecord(body)) {
      throw new AppError(
        422,
        'Payload failed validation. Required fields: imageId, radiologistId, originalLabel, finalLabel, status (APPROVED|RELABELED), notes, timestamp (ISO-8601).'
      );
    }

    const record = submitDecision(user, body.imageId, {
      status: body.status,
      finalLabel: body.finalLabel,
      notes: body.notes,
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

/** GET /api/validation — only the current radiologist's own decisions. */
export async function GET() {
  try {
    const user = await requireUser();
    const records = listDecisionsByRadiologist(user.id);
    return NextResponse.json({ records, count: records.length });
  } catch (error) {
    return toErrorResponse(error);
  }
}