import { API_ENDPOINTS } from './config';
import type {
  AdminCaseView,
  AppUser,
  Assignment,
  BulkAssignmentRequest,
  BulkAssignmentResponse,
  CaseFinalization,
  CaseReview,
  DensityChoice,
  PredictHealthResponse,
  PredictResponse,
  RadiologistWorkload,
  StudyCase,
  UserRole,
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

export async function readJson<T>(response: Response): Promise<T> {
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

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

/** GET /api/auth/me — the current session user, or null when signed out. */
export async function fetchMe(): Promise<AppUser | null> {
  const response = await fetch(API_ENDPOINTS.me, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (response.status === 401) return null;
  const payload = await readJson<{ user: AppUser }>(response);
  return payload.user;
}

/** POST /api/auth/login — authenticate and start a session. */
export async function login(
  username: string,
  password: string
): Promise<AppUser> {
  const response = await fetch(API_ENDPOINTS.login, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const payload = await readJson<{ ok: boolean; user: AppUser }>(response);
  return payload.user;
}

/** POST /api/auth/logout — end the session. */
export async function logout(): Promise<void> {
  await fetch(API_ENDPOINTS.logout, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
}

/* ------------------------------------------------------------------ */
/* Admin endpoints                                                     */
/* ------------------------------------------------------------------ */

export interface AdminUsersResponse {
  ok: boolean;
  users: AppUser[];
}

export async function fetchAdminUsers(): Promise<AppUser[]> {
  const payload = await readJson<AdminUsersResponse>(
    await fetch(API_ENDPOINTS.adminUsers, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  );
  return payload.users;
}

export interface AdminCreateUserInput {
  username: string;
  password: string;
  name: string;
  role: UserRole;
  specialty?: string;
}

export async function createAdminUser(
  input: AdminCreateUserInput
): Promise<AppUser> {
  const payload = await readJson<{ ok: true; user: AppUser }>(
    await fetch(API_ENDPOINTS.adminUsers, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  );
  return payload.user;
}

export async function updateUserActive(
  userId: string,
  active: boolean
): Promise<void> {
  await readJson<{ ok: boolean }>(
    await fetch(`${API_ENDPOINTS.adminUsers}/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
  );
}

export async function fetchAdminCases(): Promise<AdminCaseView[]> {
  const payload = await readJson<{ ok: true; cases: AdminCaseView[] }>(
    await fetch(API_ENDPOINTS.adminCases, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  );
  return payload.cases;
}

export interface EnrichedAssignment extends Assignment {
  radiologistName: string;
}

export async function fetchAdminAssignments(): Promise<EnrichedAssignment[]> {
  const payload = await readJson<{
    ok: true;
    assignments: EnrichedAssignment[];
  }>(
    await fetch(API_ENDPOINTS.adminAssignments, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  );
  return payload.assignments;
}

export async function postAdminAssignment(input: {
  imageId: string;
  radiologistId: string;
  unassign?: boolean;
}): Promise<EnrichedAssignment | null> {
  const payload = await readJson<{
    ok: boolean;
    assignment: EnrichedAssignment | null;
  }>(
    await fetch(API_ENDPOINTS.adminAssignments, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  );
  return payload.assignment;
}

export async function postBulkAssignments(
  input: BulkAssignmentRequest
): Promise<BulkAssignmentResponse> {
  const payload = await readJson<BulkAssignmentResponse>(
    await fetch(API_ENDPOINTS.adminAssignmentBulk, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  );
  return payload;
}

export async function fetchAssignmentWorkloads(): Promise<RadiologistWorkload[]> {
  const payload = await readJson<{ ok: boolean; workloads: RadiologistWorkload[] }>(
    await fetch(API_ENDPOINTS.adminAssignmentStats, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  );
  return payload.workloads;
}

export async function fetchAdminReviews(
  withDecisions = true
): Promise<CaseReview[]> {
  const url = `${API_ENDPOINTS.adminReviews}${
    withDecisions ? '?withDecisions=1' : ''
  }`;
  const payload = await readJson<{ ok: true; reviews: CaseReview[] }>(
    await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  );
  return payload.reviews;
}

export async function finalizeCase(
  imageId: string,
  finalLabel: string,
  rationale: string
): Promise<CaseFinalization> {
  const payload = await readJson<{
    ok: boolean;
    finalization: CaseFinalization;
  }>(
    await fetch(API_ENDPOINTS.adminFinalize, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId, finalLabel, rationale }),
    })
  );
  return payload.finalization;
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

/** Score 1-2 breasts from bundled samples (JSON mode). */
export async function predictBreasts(
  age: number,
  density: DensityChoice,
  breasts: { laterality: 'L' | 'R'; sampleCC: string; sampleMLO: string }[]
): Promise<PredictResponse> {
  const response = await fetch(API_ENDPOINTS.predict, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ age, density, breasts }),
  });
  return readJson<PredictResponse>(response);
}

/** Score 1-2 breasts from uploaded files (multipart mode). */
export async function predictBreastsUpload(
  age: number,
  density: DensityChoice,
  breasts: { laterality: 'L' | 'R'; cc: File; mlo: File }[]
): Promise<PredictResponse> {
  const form = new FormData();
  form.set('age', String(age));
  form.set('density', density);
  for (const breast of breasts) {
    const prefix = breast.laterality.toLowerCase();
    form.set(`${prefix}_cc`, breast.cc, breast.cc.name);
    form.set(`${prefix}_mlo`, breast.mlo, breast.mlo.name);
  }
  const response = await fetch(API_ENDPOINTS.predict, {
    method: 'POST',
    body: form,
  });
  return readJson<PredictResponse>(response);
}
