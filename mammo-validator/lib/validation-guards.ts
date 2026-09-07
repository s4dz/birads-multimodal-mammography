import type { ValidationRecord } from './types';

const STATUSES = new Set(['APPROVED', 'RELABELED']);

/** Minimal runtime guard for the validation payload (shared shape). */
export function isValidationRecord(value: unknown): value is ValidationRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.imageId === 'string' &&
    record.imageId.length > 0 &&
    typeof record.radiologistId === 'string' &&
    record.radiologistId.length > 0 &&
    typeof record.originalLabel === 'string' &&
    typeof record.finalLabel === 'string' &&
    typeof STATUSES.has(record.status as string) === 'boolean' &&
    STATUSES.has(record.status as string) &&
    typeof record.notes === 'string' &&
    typeof record.timestamp === 'string' &&
    !Number.isNaN(Date.parse(record.timestamp))
  );
}
