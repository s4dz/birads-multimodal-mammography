import { NextRequest, NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import { requireAdmin } from '@/lib/auth';
import {
  assignCase,
  getCaseStudy,
  getUserById,
  listAssignments,
  unassignCase,
} from '@/lib/db-repository';

export const dynamic = 'force-dynamic';

/** GET /api/admin/assignments — every assignment, with reviewer names. */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
    const assignments = listAssignments();
    const names = new Map<string, string>();
    for (const assignment of assignments) {
      if (!names.has(assignment.radiologistId)) {
        const user = getUserById(assignment.radiologistId);
        names.set(assignment.radiologistId, user?.name ?? assignment.radiologistId);
      }
    }
    return NextResponse.json({
      ok: true,
      assignments: assignments.map((assignment) => ({
        ...assignment,
        radiologistName: names.get(assignment.radiologistId) ?? assignment.radiologistId,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export interface AssignPayload {
  imageId: string;
  radiologistId: string;
  /** Optional: remove the assignment instead of creating it. */
  unassign?: boolean;
}

/** POST /api/admin/assignments — (re)assign or un-assign a case per payload. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const admin = await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError(400, 'Request body must be valid JSON.');
    }
    const { imageId, radiologistId, unassign } = body as Partial<AssignPayload>;
    if (typeof imageId !== 'string' || imageId.length === 0) {
      throw new AppError(422, 'imageId is required.');
    }
    if (typeof radiologistId !== 'string' || radiologistId.length === 0) {
      throw new AppError(422, 'radiologistId is required.');
    }

    const study = getCaseStudy(imageId);
    if (!study) throw new AppError(404, `Case "${imageId}" was not found.`);

    const radiologist = getUserById(radiologistId);
    if (!radiologist || radiologist.role !== 'radiologist') {
      throw new AppError(422, 'radiologistId must reference a radiologist account.');
    }
    if (!radiologist.active) {
      throw new AppError(422, 'Cannot assign to a deactivated radiologist.');
    }

    if (unassign) {
      unassignCase(imageId, radiologistId);
      return NextResponse.json({
        ok: true,
        assignment: null,
        message: `Unassigned ${imageId} from ${radiologist.name}.`,
      });
    }

    assignCase(imageId, radiologistId, admin.id);
    const assignment = listAssignments().find(
      (item) => item.imageId === imageId && item.radiologistId === radiologistId
    );
    return NextResponse.json({ ok: true, assignment });
  } catch (error) {
    return toErrorResponse(error);
  }
}