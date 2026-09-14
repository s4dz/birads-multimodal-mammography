import { NextResponse } from 'next/server';
import { getMockCases } from '@/lib/mock-data';
import type { CasesApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Serves the worklist of labelled VinDr-Mammo cases.
 */
export async function GET(): Promise<NextResponse<CasesApiResponse>> {
  return NextResponse.json({ cases: getMockCases() });
}
