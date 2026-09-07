import { NextResponse } from 'next/server';
import { getMockCases } from '@/lib/mock-data';
import type { CasesApiResponse } from '@/lib/types';

export const dynamic = 'force-static';

/** Serves the demo worklist: image + metadata + AI prediction payload. */
export async function GET(): Promise<NextResponse<CasesApiResponse>> {
  return NextResponse.json({ cases: getMockCases() });
}
