import { NextRequest, NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import { requireAdmin } from '@/lib/auth';
import {
  getCaseStudy,
  listDecisionsForImage,
  listFinalizations,
  upsertFinalization,
} from '@/lib/db-repository';
import { biradsAuditLabel } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/finalize — manually arbitrate a case and lock the
 * ground-truth label. The submitted label is always stored; disagreement is
 * NOT resolved by majority vote (the admin decides). `snapshot_json` keeps an
 * immutable copy of the AI label + every reviewer decision at finalization
 * time, so later edits to decisions never rewrite the audit trail.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const admin = await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError(400, 'Request body must be valid JSON.');
    }
    const { imageId, finalLabel, rationale } = (body ?? {}) as {
      imageId?: unknown;
      finalLabel?: unknown;
      rationale?: unknown;
    };
    if (typeof imageId !== 'string' || imageId.length === 0) {
      throw new AppError(422, 'imageId is required.');
    }
    if (typeof finalLabel !== 'string' || finalLabel.trim().length === 0) {
      throw new AppError(422, 'finalLabel is required.');
    }
    if (rationale !== undefined && typeof rationale !== 'string') {
      throw new AppError(422, 'rationale must be a string when provided.');
    }

    const study = getCaseStudy(imageId);
    if (!study) throw new AppError(404, `Case "${imageId}" was not found.`);

    const decisions = listDecisionsForImage(imageId);
    const snapshot = {
      imageId,
      aiLabel: study.needsPrediction ? 'Unlabeled' : biradsAuditLabel(study.ai.biradsGrade),
      model: study.ai.model,
      modelVersion: study.ai.modelVersion,
      decisions,
      finalLabel: finalLabel.trim(),
      adminName: admin.name,
    };

    upsertFinalization({
      imageId,
      finalLabel: finalLabel.trim(),
      rationale: typeof rationale === 'string' ? rationale.trim() : '',
      decidedBy: admin.id,
      snapshotJson: JSON.stringify(snapshot),
    });

    const finalized = listFinalizations().find((f) => f.imageId === imageId);
    return NextResponse.json({ ok: true, finalization: finalized });
  } catch (error) {
    return toErrorResponse(error);
  }
}