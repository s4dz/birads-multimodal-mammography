import { API_ENDPOINTS } from './config';
import type {
  StudyCase,
  ValidationApiResponse,
  ValidationRecord,
} from './types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* non-JSON error body */
  }
  if (!response.ok) {
    const message =
      (body as { message?: string } | null)?.message ??
      `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }
  return body as T;
}

/** GET /api/cases -> worklist of study cases (images + AI predictions). */
export async function fetchCases(): Promise<StudyCase[]> {
  const response = await fetch(API_ENDPOINTS.cases, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const payload = await readJson<{ cases: StudyCase[] }>(response);
  return payload.cases;
}

/** POST /api/validation -> persist an APPROVED / RELABELED decision. */
export async function submitValidation(
  record: ValidationRecord
): Promise<ValidationApiResponse> {
  const response = await fetch(API_ENDPOINTS.validation, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  return readJson<ValidationApiResponse>(response);
}
