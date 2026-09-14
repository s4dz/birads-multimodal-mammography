import { API_ENDPOINTS } from './config';
import type {
  DensityChoice,
  PredictHealthResponse,
  PredictResponse,
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

/** GET /api/validation -> every decision recorded in this server session. */
export async function fetchValidationRecords(): Promise<ValidationRecord[]> {
  const response = await fetch(API_ENDPOINTS.validation, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const payload = await readJson<{
    records: ValidationRecord[];
    count: number;
  }>(response);
  return payload.records;
}

/* ------------------------------------------------------------------ */
/* Prediction (Mode 1)                                                 */
/* ------------------------------------------------------------------ */

/** GET /api/predict -> ensemble health + a short list of bundled samples. */
export async function fetchPredictHealth(): Promise<PredictHealthResponse> {
  const response = await fetch(API_ENDPOINTS.predict, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  return readJson<PredictHealthResponse>(response);
}

/** Score a bundled sample image (must live under public/samples). */
export async function predictSample(
  samplePath: string,
  age: number,
  density: DensityChoice
): Promise<PredictResponse> {
  const response = await fetch(API_ENDPOINTS.predict, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ samplePath, age, density }),
  });
  return readJson<PredictResponse>(response);
}

/** Score an uploaded PNG/JPG or DICOM file. */
export async function predictUpload(
  file: File,
  age: number,
  density: DensityChoice
): Promise<PredictResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('age', String(age));
  form.append('density', density);
  const response = await fetch(API_ENDPOINTS.predict, {
    method: 'POST',
    body: form,
  });
  return readJson<PredictResponse>(response);
}
