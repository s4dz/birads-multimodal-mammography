import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/app-error';
import { requireUser } from '@/lib/auth';
import {
  listAllCaseStudies,
  listAssignedImageIds,
  listCaseStudiesByIds,
} from '@/lib/db-repository';
import type { CasesApiResponse, StudyCase } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cases — the worklist for the current session user.
 *
 * Radiologists see only the cases they were assigned by an administrator.
 * Admins see the full dataset (they rarely review; the admin screens use
 * `/api/admin/cases`). The client keeps its existing StudyCase consumption.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    let cases: StudyCase[];
    if (user.role === 'radiologist') {
      cases = listCaseStudiesByIds(listAssignedImageIds(user.id));
    } else {
      cases = listAllCaseStudies();
    }
    const payload: CasesApiResponse = { cases };
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}