import { NextRequest, NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import { requireUser } from '@/lib/auth';
import { getCaseStudy } from '@/lib/db-repository';
import { submitDecision } from '@/lib/decision-service';
import type { PredictProbabilities } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/cases/:imageId/label — persist a reviewed label onto a dataset
 * case (and, when given, its per-breast partner view).
 *
 * This is the /predict sign-off the client calls right after scoring an
 * unlabeled case: the returned class name becomes the case label, the joint
 * breast probabilities are stored so the worklist fusion reproduces the same
 * assessment, and a decision row is written for audit. Radiologists must be
 * assigned; admins may persist on any case.
 */

function parseProbabilities(value: unknown): PredictProbabilities | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const pick = (key: string): number => {
    const n = Number(record[key]);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0;
  };
  return {
    normal: pick('normal'),
    benignLeaning: pick('benignLeaning'),
    suspicious: pick('suspicious'),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
): Promise<NextResponse> {
  try {
    const { imageId } = await params;
    const user = await requireUser();
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new AppError(400, 'Request body must be valid JSON.');
    }

    const rawStatus = String(body.status ?? '').toUpperCase();
    if (rawStatus !== 'APPROVED' && rawStatus !== 'RELABELED') {
      throw new AppError(
        422,
        'status must be "APPROVED" or "RELABELED".'
      );
    }
    const status = rawStatus as 'APPROVED' | 'RELABELED';
    const finalLabel = String(body.finalLabel ?? '').trim();
    const notes = String(body.notes ?? '').trim();
    const partnerRaw = String(body.partnerImageId ?? '').trim();
    const partnerImageId = partnerRaw && partnerRaw !== imageId ? partnerRaw : undefined;
    const classProbabilities = body.classProbabilities
      ? parseProbabilities(body.classProbabilities)
      : undefined;

    const payload = { status, finalLabel, notes };
    const records = [submitDecision(user, imageId, payload, { classProbabilities })];
    if (partnerImageId && getCaseStudy(partnerImageId)) {
      records.push(
        submitDecision(user, partnerImageId, payload, { classProbabilities })
      );
    }

    return NextResponse.json({
      ok: true,
      records,
      persistedCount: records.length,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}