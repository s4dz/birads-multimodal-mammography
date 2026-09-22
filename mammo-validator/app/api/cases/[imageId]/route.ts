import { NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import { requireUser } from '@/lib/auth';
import {
  assignedRadiologistIdsFor,
  getCaseStudy,
  getFinalization,
  isAssigned,
} from '@/lib/db-repository';
import { decisionsForImage } from '@/lib/decision-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cases/:imageId — one study plus its live review context.
 *
 * Radiologists: only when assigned. Admins: always, with every reviewer's
 * decision so the arbitration UI can render both sides.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ imageId: string }> }
): Promise<NextResponse> {
  try {
    const { imageId } = await params;
    const user = await requireUser();
    const study = getCaseStudy(imageId);
    if (!study) throw new AppError(404, `Case "${imageId}" was not found.`);

    const finalization = getFinalization(imageId);
    if (user.role === 'radiologist') {
      if (!isAssigned(imageId, user.id)) {
        throw new AppError(
          403,
          `You are not assigned to case "${imageId}".`
        );
      }
      return NextResponse.json({
        ok: true,
        case: study,
        decisions: [],
        assigned: true,
        finalization,
      });
    }

    return NextResponse.json({
      ok: true,
      case: study,
      decisions: decisionsForImage(imageId),
      assignedRadiologists: assignedRadiologistIdsFor(imageId),
      finalization,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}