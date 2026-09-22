import { NextRequest, NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/app-error';
import { requireAdmin } from '@/lib/auth';
import { listCaseReviews } from '@/lib/db-repository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/reviews — every image with each reviewer's decision and the
 * consensus / disagreement status, ready for the arbitration screen.
 * `?withDecisions=1` narrows the list to images that already have decisions.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin();
    const withDecisions =
      request.nextUrl.searchParams.get('withDecisions') === '1';
    return NextResponse.json({
      ok: true,
      reviews: listCaseReviews(withDecisions),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}