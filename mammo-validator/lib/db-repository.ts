import { getDb } from './db';
import { AppError } from './app-error';
import type { CasePatientRef } from './assignment-balancer';
import type {
  AdminCaseView,
  AppUser,
  Assignment,
  CaseFinalization,
  CaseReview,
  PatientDemographics,
  RadiologistWorkload,
  StudyCase,
  UserRole,
  ValidationRecord,
} from './types';

/**
 * Data-access layer over the SQLite store. Server-only. Every function is
 * synchronous (the driver is `node:sqlite` `DatabaseSync`).
 */

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  role: UserRole;
  specialty: string;
  active: number;
  created_at: string;
}

function userRowToView(row: UserRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    specialty: row.specialty,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export interface CreateUserInput {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  specialty?: string;
}

export function createUser(input: CreateUserInput): AppUser {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO users (id, username, password_hash, name, role, specialty, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      input.id,
      input.username,
      input.passwordHash,
      input.name,
      input.role,
      input.specialty ?? '',
      now
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    if (/UNIQUE/.test(message)) {
      throw new AppError(409, `Username "${input.username}" is already taken.`);
    }
    throw error;
  }
  return {
    id: input.id,
    username: input.username,
    name: input.name,
    role: input.role,
    specialty: input.specialty ?? '',
    active: true,
    createdAt: now,
  };
}

export function listUsers(): AppUser[] {
  return getDb()
    .prepare(
      `SELECT id, username, password_hash, name, role, specialty, active, created_at
       FROM users ORDER BY role DESC, username COLLATE NOCASE`
    )
    .all()
    .map((row) => userRowToView(row as unknown as UserRow));
}

export function listRadiologists(): AppUser[] {
  return listUsers().filter((user) => user.role === 'radiologist' && user.active);
}

function findUserByWhere(
  sql: string,
  value: string
): (UserRow & { password_hash: string }) | null {
  const row = getDb().prepare(sql).get(value) as UserRow | undefined;
  return row ?? null;
}

export function getUserById(id: string): (AppUser & { passwordHash: string }) | null {
  const row = findUserByWhere(
    `SELECT id, username, password_hash, name, role, specialty, active, created_at
     FROM users WHERE id = ?`,
    id
  );
  return row ? { ...userRowToView(row), passwordHash: row.password_hash } : null;
}

export function getUserByUsername(
  username: string
): (AppUser & { passwordHash: string }) | null {
  const row = findUserByWhere(
    `SELECT id, username, password_hash, name, role, specialty, active, created_at
     FROM users WHERE username = ? COLLATE NOCASE`,
    username
  );
  return row ? { ...userRowToView(row), passwordHash: row.password_hash } : null;
}

export function setUserActive(id: string, active: boolean): void {
  const db = getDb();
  const result = db
    .prepare(`UPDATE users SET active = ? WHERE id = ? AND role = 'radiologist'`)
    .run(active ? 1 : 0, id);
  if (result.changes === 0) {
    throw new AppError(404, 'Radiologist not found.');
  }
}

/* ------------------------------------------------------------------ */
/* Cases                                                               */
/* ------------------------------------------------------------------ */

export function insertCases(cases: StudyCase[]): number {
  const db = getDb();
  const statement = db.prepare(
    `INSERT INTO cases
       (image_id, patient_id, patient_sex, patient_age, laterality, view, needs_prediction, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.exec('BEGIN');
  try {
    for (const study of cases) {
      statement.run(
        study.imageId,
        study.patient.id,
        study.patient.sex,
        study.patient.ageAtStudy ?? null,
        study.acquisition.laterality,
        study.acquisition.view,
        study.needsPrediction ? 1 : 0,
        JSON.stringify(study)
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return cases.length;
}

export function countCases(): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM cases`).get() as {
    n: number;
  };
  return Number(row?.n ?? 0);
}

export function getCaseStudy(imageId: string): StudyCase | null {
  const row = getDb()
    .prepare(`SELECT payload_json FROM cases WHERE image_id = ?`)
    .get(imageId) as { payload_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.payload_json) as StudyCase;
}

export function listAssignedImageIds(radiologistId: string): string[] {
  const rows = getDb()
    .prepare(`SELECT image_id FROM assignments WHERE radiologist_id = ?`)
    .all(radiologistId) as Array<{ image_id: string }>;
  return rows.map((row) => row.image_id);
}

export function listAllCaseStudies(): StudyCase[] {
  const rows = getDb()
    .prepare(`SELECT payload_json FROM cases ORDER BY patient_id, image_id`)
    .all() as Array<{ payload_json: string }>;
  return rows.map((row) => JSON.parse(row.payload_json) as StudyCase);
}

export function listCaseStudiesByIds(imageIds: string[]): StudyCase[] {
  if (imageIds.length === 0) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT image_id, payload_json FROM cases WHERE image_id IN (${imageIds
        .map(() => '?')
        .join(', ')})`
    )
    .all(...imageIds) as Array<{ image_id: string; payload_json: string }>;
  const byId = new Map(rows.map((row) => [row.image_id, row.payload_json]));
  return imageIds
    .map((imageId) => byId.get(imageId))
    .filter((payload): payload is string => Boolean(payload))
    .map((payload) => JSON.parse(payload) as StudyCase);
}

export function isAssigned(imageId: string, radiologistId: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 FROM assignments WHERE image_id = ? AND radiologist_id = ?`
    )
    .get(imageId, radiologistId);
  return row !== undefined;
}

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */

export function assignCase(
  imageId: string,
  radiologistId: string,
  assignedBy: string
): void {
  const db = getDb();
  const now = new Date().toISOString();
  // Idempotent: re-assigning the same (case, reviewer) pair is a no-op.
  db.prepare(
    `INSERT OR IGNORE INTO assignments (image_id, radiologist_id, assigned_by, assigned_at)
     VALUES (?, ?, ?, ?)`
  ).run(imageId, radiologistId, assignedBy, now);
}

export function unassignCase(imageId: string, radiologistId: string): void {
  getDb()
    .prepare(`DELETE FROM assignments WHERE image_id = ? AND radiologist_id = ?`)
    .run(imageId, radiologistId);
}

export function listAssignments(): Assignment[] {
  const rows = getDb()
    .prepare(
      `SELECT image_id, radiologist_id, assigned_by, assigned_at
       FROM assignments ORDER BY assigned_at`
    )
    .all() as Array<{
    image_id: string;
    radiologist_id: string;
    assigned_by: string;
    assigned_at: string;
  }>;
  return rows.map((row) => ({
    imageId: row.image_id,
    radiologistId: row.radiologist_id,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
  }));
}

export function assignedRadiologistIdsFor(imageId: string): string[] {
  const rows = getDb()
    .prepare(`SELECT radiologist_id FROM assignments WHERE image_id = ?`)
    .all(imageId) as Array<{ radiologist_id: string }>;
  return rows.map((row) => row.radiologist_id);
}

/** Run `fn` inside a single SQLite transaction, rolling back on error. */
export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** image_id + patient_id pairs for the given image ids (missing ids skipped). */
export function listCasePatientRefs(imageIds: string[]): CasePatientRef[] {
  if (imageIds.length === 0) return [];
  const rows = getDb()
    .prepare(
      `SELECT image_id, patient_id FROM cases WHERE image_id IN (${imageIds
        .map(() => '?')
        .join(', ')})`
    )
    .all(...imageIds) as Array<{ image_id: string; patient_id: string }>;
  return rows.map((row) => ({ imageId: row.image_id, patientId: row.patient_id }));
}

/** Remove every assignment row for the given image ids. */
export function clearAssignmentsFor(imageIds: string[]): void {
  if (imageIds.length === 0) return;
  getDb()
    .prepare(
      `DELETE FROM assignments WHERE image_id IN (${imageIds
        .map(() => '?')
        .join(', ')})`
    )
    .run(...imageIds);
}

/** Per-radiologist workload counts for the Assignment Manager. */
export function listRadiologistWorkloads(): RadiologistWorkload[] {
  const db = getDb();
  const assigned = new Map<string, number>();
  const completed = new Map<string, number>();
  db.prepare(
    `SELECT radiologist_id, COUNT(*) AS n FROM assignments GROUP BY radiologist_id`
  )
    .all()
    .forEach((row) =>
      assigned.set(
        (row as { radiologist_id: string }).radiologist_id,
        Number((row as { n: number }).n)
      )
    );
  db.prepare(
    `SELECT radiologist_id, COUNT(*) AS n FROM decisions GROUP BY radiologist_id`
  )
    .all()
    .forEach((row) =>
      completed.set(
        (row as { radiologist_id: string }).radiologist_id,
        Number((row as { n: number }).n)
      )
    );
  return listRadiologists().map((user) => ({
    radiologistId: user.id,
    assigned: assigned.get(user.id) ?? 0,
    completed: completed.get(user.id) ?? 0,
  }));
}

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

export function upsertDecision(record: ValidationRecord): void {
  const db = getDb();
  const exists = db
    .prepare(`SELECT 1 FROM decisions WHERE image_id = ? AND radiologist_id = ?`)
    .get(record.imageId, record.radiologistId);
  if (exists) {
    db.prepare(
      `UPDATE decisions
         SET original_label = ?, final_label = ?, status = ?, notes = ?, timestamp = ?
       WHERE image_id = ? AND radiologist_id = ?`
    ).run(
      record.originalLabel,
      record.finalLabel,
      record.status,
      record.notes,
      record.timestamp,
      record.imageId,
      record.radiologistId
    );
  } else {
    db.prepare(
      `INSERT INTO decisions
         (image_id, radiologist_id, original_label, final_label, status, notes, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.imageId,
      record.radiologistId,
      record.originalLabel,
      record.finalLabel,
      record.status,
      record.notes,
      record.timestamp
    );
  }
}

function decisionFromRow(row: {
  image_id: string;
  radiologist_id: string;
  original_label: string;
  final_label: string;
  status: string;
  notes: string;
  timestamp: string;
}): ValidationRecord {
  return {
    imageId: row.image_id,
    radiologistId: row.radiologist_id,
    originalLabel: row.original_label,
    finalLabel: row.final_label,
    status: row.status as ValidationRecord['status'],
    notes: row.notes,
    timestamp: row.timestamp,
  };
}

export function listDecisionsByRadiologist(radiologistId: string): ValidationRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT image_id, radiologist_id, original_label, final_label, status, notes, timestamp
       FROM decisions WHERE radiologist_id = ? ORDER BY timestamp DESC`
    )
    .all(radiologistId) as Parameters<typeof decisionFromRow>[0][];
  return rows.map(decisionFromRow);
}

export function listDecisionsForImage(imageId: string): ValidationRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT image_id, radiologist_id, original_label, final_label, status, notes, timestamp
       FROM decisions WHERE image_id = ? ORDER BY timestamp`
    )
    .all(imageId) as Parameters<typeof decisionFromRow>[0][];
  return rows.map(decisionFromRow);
}

export function countDecisions(): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM decisions`).get() as {
    n: number;
  };
  return Number(row?.n ?? 0);
}

/* ------------------------------------------------------------------ */
/* Finalizations                                                       */
/* ------------------------------------------------------------------ */

export function upsertFinalization(input: {
  imageId: string;
  finalLabel: string;
  rationale: string;
  decidedBy: string;
  snapshotJson: string;
}): CaseFinalization {
  const db = getDb();
  const now = new Date().toISOString();
  const exists = db
    .prepare(`SELECT 1 FROM case_finalizations WHERE image_id = ?`)
    .get(input.imageId);
  if (exists) {
    db.prepare(
      `UPDATE case_finalizations
         SET final_label = ?, rationale = ?, decided_by = ?, finalized_at = ?, snapshot_json = ?
       WHERE image_id = ?`
    ).run(
      input.finalLabel,
      input.rationale,
      input.decidedBy,
      now,
      input.snapshotJson,
      input.imageId
    );
  } else {
    db.prepare(
      `INSERT INTO case_finalizations
         (image_id, final_label, rationale, decided_by, finalized_at, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      input.imageId,
      input.finalLabel,
      input.rationale,
      input.decidedBy,
      now,
      input.snapshotJson
    );
  }
  return {
    imageId: input.imageId,
    finalLabel: input.finalLabel,
    rationale: input.rationale,
    decidedBy: input.decidedBy,
    finalizedAt: now,
  };
}

export function listFinalizations(): CaseFinalization[] {
  const rows = getDb()
    .prepare(
      `SELECT image_id, final_label, rationale, decided_by, finalized_at
       FROM case_finalizations ORDER BY finalized_at DESC`
    )
    .all() as Array<{
    image_id: string;
    final_label: string;
    rationale: string;
    decided_by: string;
    finalized_at: string;
  }>;
  return rows.map((row) => ({
    imageId: row.image_id,
    finalLabel: row.final_label,
    rationale: row.rationale,
    decidedBy: row.decided_by,
    finalizedAt: row.finalized_at,
  }));
}

export function getFinalization(imageId: string): CaseFinalization | null {
  const row = getDb()
    .prepare(
      `SELECT image_id, final_label, rationale, decided_by, finalized_at
       FROM case_finalizations WHERE image_id = ?`
    )
    .get(imageId) as
    | {
        image_id: string;
        final_label: string;
        rationale: string;
        decided_by: string;
        finalized_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    imageId: row.image_id,
    finalLabel: row.final_label,
    rationale: row.rationale,
    decidedBy: row.decided_by,
    finalizedAt: row.finalized_at,
  };
}

/* ------------------------------------------------------------------ */
/* Aggregations for the admin views                                    */
/* ------------------------------------------------------------------ */

function reviewStatusOf(
  decisions: ValidationRecord[],
  finalization: CaseFinalization | null
): CaseReview['reviewStatus'] {
  if (finalization) return 'finalized';
  if (decisions.length === 0) return 'not_started';
  const labels = new Set(decisions.map((decision) => decision.finalLabel));
  return labels.size === 1 ? 'consensus' : 'disagreement';
}

export function listAdminCases(): AdminCaseView[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT image_id, patient_id, patient_sex, patient_age, laterality, view, needs_prediction, payload_json
       FROM cases ORDER BY patient_id, image_id`
    )
    .all() as Array<{
    image_id: string;
    patient_id: string;
    patient_sex: string;
    patient_age: number | null;
    laterality: string;
    view: string;
    needs_prediction: number;
    payload_json: string;
  }>;

  const assignmentCounts = new Map<string, number>();
  const decisionCounts = new Map<string, number>();
  const finalized = new Map<string, CaseFinalization>();
  const decisionsByImage = new Map<string, ValidationRecord[]>();
  db.prepare(
    `SELECT image_id, COUNT(*) AS n FROM assignments GROUP BY image_id`
  )
    .all()
    .forEach((row) =>
      assignmentCounts.set(
        (row as { image_id: string }).image_id,
        Number((row as { n: number }).n)
      )
    );
  db.prepare(
    `SELECT image_id, COUNT(*) AS n FROM decisions GROUP BY image_id`
  )
    .all()
    .forEach((row) =>
      decisionCounts.set(
        (row as { image_id: string }).image_id,
        Number((row as { n: number }).n)
      )
    );
  for (const finalization of listFinalizations()) {
    finalized.set(finalization.imageId, finalization);
  }
  for (const record of listAllDecisions()) {
    const list = decisionsByImage.get(record.imageId) ?? [];
    list.push(record);
    decisionsByImage.set(record.imageId, list);
  }

  const getPatient = (
    row: (typeof rows)[number]
  ): PatientDemographics => ({
    id: row.patient_id,
    sex: row.patient_sex as 'F' | 'M',
    ageAtStudy: row.patient_age ?? undefined,
  });

  return rows.map((row) => {
    const study = JSON.parse(row.payload_json) as StudyCase;
    const decisions = decisionsByImage.get(row.image_id) ?? [];
    return {
      imageId: row.image_id,
      patient: getPatient(row),
      laterality: study.acquisition.laterality,
      view: study.acquisition.view,
      needsPrediction: row.needs_prediction === 1,
      ai: {
        biradsGrade: study.ai.biradsGrade,
        predictedClass: study.ai.predictedClass,
        confidence: study.ai.confidence,
      },
      assignedRadiologists: assignedRadiologistIdsFor(row.image_id),
      decisions: decisions.length,
      reviewStatus: reviewStatusOf(decisions, finalized.get(row.image_id) ?? null),
      finalized: finalized.has(row.image_id),
    };
  });
}

export function listAllDecisions(): ValidationRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT image_id, radiologist_id, original_label, final_label, status, notes, timestamp
       FROM decisions ORDER BY timestamp`
    )
    .all() as Parameters<typeof decisionFromRow>[0][];
  return rows.map(decisionFromRow);
}

export function listCaseReviews(onlyWithDecisions: boolean): CaseReview[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT image_id, payload_json FROM cases ORDER BY patient_id, image_id`
    )
    .all() as Array<{ image_id: string; payload_json: string }>;

  const names = new Map<string, string>();
  for (const user of listUsers()) names.set(user.id, user.name);

  const reviews: CaseReview[] = [];
  for (const row of rows) {
    const study = JSON.parse(row.payload_json) as StudyCase;
    const decisions = listDecisionsForImage(row.image_id);
    if (onlyWithDecisions && decisions.length === 0) continue;
    const finalization = getFinalization(row.image_id);
    reviews.push({
      imageId: row.image_id,
      patient: study.patient,
      acquisition: study.acquisition,
      needsPrediction: Boolean(study.needsPrediction ?? false),
      ai: {
        biradsGrade: study.ai.biradsGrade,
        predictedClass: study.ai.predictedClass,
        confidence: study.ai.confidence,
      },
      decisions: decisions.map((decision) => ({
        ...decision,
        radiologistName: names.get(decision.radiologistId) ?? decision.radiologistId,
      })),
      reviewStatus: reviewStatusOf(decisions, finalization),
      finalization,
    });
  }
  return reviews;
}