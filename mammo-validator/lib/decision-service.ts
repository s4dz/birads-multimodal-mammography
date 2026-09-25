import { AppError } from './app-error';
import {
  getCaseStudy,
  isAssigned,
  listDecisionsForImage,
  updateCasePayload,
  upsertDecision,
} from './db-repository';
import { applyLabelToStudy } from './label-persist';
import { biradsAuditLabel } from './taxonomy';
import type {
  AppUser,
  PredictProbabilities,
  ValidationRecord,
  ValidationStatus,
} from './types';

/**
 * Shared decision-persistence logic for both the legacy `/api/validation`
 * endpoint and the explicit `/api/cases/:imageId/label` route.
 *
 * Security: the reviewer identity always comes from the backend session
 * (`user`), never from the request body. `originalLabel` is re-derived from
 * the stored case, so a caller cannot rewrite the AI audit string. `finalLabel`
 * is honoured from the request (predict sign-off needs it) but defaults to the
 * original label when omitted. Radiologists may only decide on assigned cases;
 * admins may persist a label on any case. After recording the decision the
 * stored case label is updated so the worklist reflects it immediately.
 */

export interface DecisionPayload {
  status: ValidationStatus;
  /** Required when relabelling; ignored/optional when approving. */
  finalLabel?: string;
  notes?: string;
}

export interface DecisionOptions {
  /** Joint breast probabilities of the live predict (persisted into `ai`). */
  classProbabilities?: PredictProbabilities;
}

export function submitDecision(
  user: AppUser,
  imageId: string,
  payload: DecisionPayload,
  options: DecisionOptions = {}
): ValidationRecord {
  if (user.role !== 'radiologist' && user.role !== 'admin') {
    throw new AppError(403, 'Only staff can record decisions.');
  }
  const study = getCaseStudy(imageId);
  if (!study) {
    throw new AppError(404, `Case "${imageId}" was not found.`);
  }
  if (user.role === 'radiologist' && !isAssigned(imageId, user.id)) {
    throw new AppError(
      403,
      `You are not assigned to case "${imageId}". Ask an administrator to assign it.`
    );
  }

  const originalLabel = study.needsPrediction
    ? 'Unlabeled'
    : biradsAuditLabel(study.ai.biradsGrade);

  // The reviewer's label always comes from the request; when omitted it
  // defaults to the (server-derived) original AI label. originalLabel above
  // stays authoritative and is never attacker-controlled.
  const requestedFinal = (payload.finalLabel ?? '').trim();
  const finalLabel = requestedFinal || originalLabel;
  if (!finalLabel) {
    throw new AppError(
      422,
      'finalLabel is required when the case has no AI label.'
    );
  }

  const record: ValidationRecord = {
    imageId,
    radiologistId: user.id,
    originalLabel,
    finalLabel,
    status: payload.status,
    notes: payload.notes?.trim() ?? '',
    timestamp: new Date().toISOString(),
  };
  upsertDecision(record);
  updateCasePayload(
    imageId,
    applyLabelToStudy(study, {
      finalLabel,
      status: payload.status,
      classProbabilities: options.classProbabilities,
    }),
    false
  );
  return record;
}

/** List the decisions already recorded on an image (for panel context). */
export function decisionsForImage(imageId: string): ValidationRecord[] {
  return listDecisionsForImage(imageId);
}