import { AppError } from './app-error';
import {
  getCaseStudy,
  isAssigned,
  listDecisionsForImage,
  upsertDecision,
} from './db-repository';
import { biradsAuditLabel } from './taxonomy';
import type { AppUser, ValidationRecord, ValidationStatus } from './types';

/**
 * Shared decision-persistence logic for both the legacy `/api/validation`
 * endpoint and the explicit `/api/cases/:imageId/decision` route.
 *
 * Security: the reviewer identity always comes from the backend session
 * (`user`), never from the request body. `originalLabel` is re-derived from
 * the stored case, so a caller cannot rewrite the AI audit string. `finalLabel`
 * is honoured from the request (predict sign-off needs it) but defaults to the
 * original label when omitted. Decisions are only accepted from an active
 * radiologist assigned to the case.
 */

export interface DecisionPayload {
  status: ValidationStatus;
  /** Required when relabelling; ignored/optional when approving. */
  finalLabel?: string;
  notes?: string;
}

export function submitDecision(
  user: AppUser,
  imageId: string,
  payload: DecisionPayload
): ValidationRecord {
  if (user.role !== 'radiologist') {
    throw new AppError(403, 'Only radiologists can record decisions.');
  }
  const study = getCaseStudy(imageId);
  if (!study) {
    throw new AppError(404, `Case "${imageId}" was not found.`);
  }
  if (!isAssigned(imageId, user.id)) {
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
  return record;
}

/** List the decisions already recorded on an image (for panel context). */
export function decisionsForImage(imageId: string): ValidationRecord[] {
  return listDecisionsForImage(imageId);
}