import type { ValidationRecord } from './types';

/**
 * In-memory validation log for the demo server.
 *
 * This intentionally lives outside the React tree: it is only imported by
 * route handlers (Node runtime). For a real deployment, replace this module
 * with a repository backed by Postgres / FHIR / DICOM SR without touching the
 * route handlers or client code.
 */

const persisted: ValidationRecord[] = [];

export function addValidationRecord(record: ValidationRecord): number {
  persisted.unshift(record);
  return persisted.length;
}

export function listValidationRecords(): ValidationRecord[] {
  return persisted.slice();
}

export function clearValidationRecords(): void {
  persisted.length = 0;
}
