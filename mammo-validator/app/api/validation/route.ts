import { NextRequest, NextResponse } from 'next/server';
import {
  addValidationRecord,
  listValidationRecords,
} from '@/lib/server-validation-store';
import type { ValidationRecord } from '@/lib/types';
import { isValidationRecord } from '@/lib/validation-guards';

export const dynamic = 'force-dynamic';

/**
 * Receives the radiologist decision payload:
 * { imageId, radiologistId, originalLabel, finalLabel, status, notes, timestamp }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  if (!isValidationRecord(body)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          'Payload failed validation. Required fields: imageId, radiologistId, originalLabel, finalLabel, status (APPROVED|RELABELED), notes, timestamp (ISO-8601).',
      },
      { status: 422 }
    );
  }

  const record: ValidationRecord = body;
  const persistedCount = addValidationRecord(record);

  return NextResponse.json({
    ok: true,
    record,
    persistedCount,
  });
}

/** Diagnostics / demo helper: list every decision recorded in this session. */
export async function GET(): Promise<
  NextResponse<{ records: ValidationRecord[]; count: number }>
> {
  const records = listValidationRecords();
  return NextResponse.json({ records, count: records.length });
}
