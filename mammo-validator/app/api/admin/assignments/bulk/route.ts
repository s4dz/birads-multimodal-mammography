import { NextRequest, NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import { requireAdmin } from '@/lib/auth';
import {
  assignCase,
  clearAssignmentsFor,
  getUserById,
  listCasePatientRefs,
  listRadiologistWorkloads,
  unassignCase,
  withTransaction,
} from '@/lib/db-repository';
import {
  balanceGroups,
  groupByPatient,
  type PatientGroup,
} from '@/lib/assignment-balancer';
import type {
  BulkAssignmentAction,
  BulkAssignmentMode,
  BulkAssignmentRequest,
  BulkAssignmentResponse,
  BulkAssignmentTarget,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function validateRadiologistId(id: string, checked: Map<string, boolean>): void {
  if (checked.has(id)) return;
  const radiologist = getUserById(id);
  if (!radiologist || radiologist.role !== 'radiologist') {
    throw new AppError(422, `"${id}" is not a radiologist account.`);
  }
  if (!radiologist.active) {
    throw new AppError(422, `Cannot assign to deactivated radiologist "${id}".`);
  }
  checked.set(id, true);
}

export interface BulkAssignmentPayload {
  imageIds: string[];
  radiologistIds: string[];
  action: BulkAssignmentAction;
  mode: BulkAssignmentMode;
  replaceExisting: boolean;
  dryRun: boolean;
}

/**
 * POST /api/admin/assignments/bulk
 *
 * Assign (or unassign) a large set of cases to one or more radiologists in a
 * single transaction. `mode: "all"` gives every selected reviewer the whole
 * selection (independent multi-review); `mode: "balanced"` splits the selected
 * patient groups across reviewers while respecting current workload.
 * `dryRun: true` returns the planned split without writing anything.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const admin = await requireAdmin();
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      throw new AppError(400, 'Request body must be valid JSON.');
    }
    const body = parsed as Partial<BulkAssignmentRequest>;

    if (
      !Array.isArray(body.imageIds) ||
      body.imageIds.length === 0 ||
      body.imageIds.some((id) => typeof id !== 'string' || id.length === 0)
    ) {
      throw new AppError(422, 'imageIds must be a non-empty array of case ids.');
    }
    if (
      !Array.isArray(body.radiologistIds) ||
      body.radiologistIds.length === 0 ||
      body.radiologistIds.some((id) => typeof id !== 'string' || id.length === 0)
    ) {
      throw new AppError(
        422,
        'radiologistIds must be a non-empty array of radiologist ids.'
      );
    }

    const payload: BulkAssignmentPayload = {
      imageIds: dedupe(body.imageIds),
      radiologistIds: dedupe(body.radiologistIds),
      action: body.action === 'unassign' ? 'unassign' : 'assign',
      mode: body.mode === 'balanced' ? 'balanced' : 'all',
      replaceExisting: Boolean(body.replaceExisting),
      dryRun: Boolean(body.dryRun),
    };

    for (const id of payload.radiologistIds) {
      validateRadiologistId(id, new Map<string, boolean>());
    }

    const refs = listCasePatientRefs(payload.imageIds);
    if (refs.length !== payload.imageIds.length) {
      throw new AppError(
        422,
        `${payload.imageIds.length - refs.length} of the selected cases were not found.`
      );
    }

    const groups = groupByPatient(refs);
    let targets: BulkAssignmentTarget[];

    const plan = (): Map<string, PatientGroup[]> => {
      if (payload.action === 'unassign') return new Map();
      if (payload.mode === 'balanced') {
        const workloads = new Map(
          listRadiologistWorkloads().map((w) => [w.radiologistId, w.assigned])
        );
        const split = balanceGroups(
          groups,
          payload.radiologistIds.map((id) => ({
            id,
            currentLoad: workloads.get(id) ?? 0,
          }))
        );
        return new Map(
          split.map((target) => [target.radiologistId, target.patientGroups])
        );
      }
      return new Map(
        payload.radiologistIds.map((id) => [id, groups])
      );
    };

    if (payload.dryRun) {
      const dryPlan = plan();
      targets = payload.radiologistIds.map((id) => {
        const imageIds = (dryPlan.get(id) ?? []).flatMap((g) => g.imageIds);
        return {
          radiologistId: id,
          assignedImages: imageIds.length,
          patientGroups: dryPlan.get(id)?.length ?? 0,
        };
      });
      const response: BulkAssignmentResponse = {
        ok: true,
        dryRun: true,
        totalImages: refs.length,
        totalGroups: groups.length,
        targets,
        message: 'Preview only — nothing was written to the database.',
      };
      return NextResponse.json(response);
    }

    const writePlan = plan();
    withTransaction(() => {
      if (payload.action === 'unassign') {
        for (const radioId of payload.radiologistIds) {
          for (const imageId of payload.imageIds) {
            unassignCase(imageId, radioId);
          }
        }
        return;
      }
      if (payload.replaceExisting) {
        clearAssignmentsFor(refs.map((ref) => ref.imageId));
      }
      for (const [radioId, groupList] of writePlan) {
        for (const group of groupList) {
          for (const imageId of group.imageIds) {
            assignCase(imageId, radioId, admin.id);
          }
        }
      }
    });

    targets = payload.radiologistIds.map((id) => {
      const imageIds = (writePlan.get(id) ?? []).flatMap((g) => g.imageIds);
      return {
        radiologistId: id,
        assignedImages: imageIds.length,
        patientGroups: writePlan.get(id)?.length ?? 0,
      };
    });

    const verb = payload.action === 'unassign' ? 'Unassigned' : 'Assigned';
    const response: BulkAssignmentResponse = {
      ok: true,
      dryRun: false,
      totalImages: refs.length,
      totalGroups: groups.length,
      targets,
      message: `${verb} ${refs.length} case(s) across ${targets.length} reviewer(s).`,
    };
    return NextResponse.json(response);
  } catch (error) {
    return toErrorResponse(error);
  }
}