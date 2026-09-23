/**
 * Domain types for the Mammography AI-Validation Workbench.
 *
 * These types are deliberately framework-agnostic so they can be shared
 * verbatim between the API routes (server) and the React client.
 */

export type ImageType = 'dicom' | 'png';

export type ValidationStatus = 'APPROVED' | 'RELABELED';

export type Laterality = 'L' | 'R';

/** Standard screening mammography projections. */
export type MammogramView =
  | 'CC' // Craniocaudal
  | 'MLO' // Mediolateral oblique
  | 'ML' // Mediolateral
  | 'LM' // Lateromedial
  | 'FB'; // From below (not typically screening)

export type BiRadsGrade =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4A'
  | '4B'
  | '4C'
  | '5'
  | '6';

export type Tone =
  | 'neutral'
  | 'positive'
  | 'low-risk'
  | 'watch'
  | 'suspicious'
  | 'critical';

/** Index of the model's coarse 3-class severity output. */
export type AiClassIndex = 0 | 1 | 2;

/**
 * The model is trained on 3 coarse classes (Normal / Benign-leaning /
 * Suspicious), not on raw BI-RADS. `name` is the class and `range` the
 * BI-RADS span that class covers. `grade` optionally carries the exact
 * ground-truth VinDr grade (from `breast_birads`).
 */
export interface AiClassLabel {
  index: AiClassIndex;
  name: string;
  /** e.g. "BI-RADS 2-3". */
  range: string;
  /** Ground-truth VinDr grade when known, e.g. "BI-RADS 2". */
  grade?: string;
}

export interface BiRadsDescriptor {
  /** Canonical code, e.g. "4C". */
  grade: BiRadsGrade;
  /** Short canonical label, e.g. "BI-RADS 4C". */
  label: string;
  /** Clinical title, e.g. "Suspicious abnormality". */
  title: string;
  /** Full one-line description used for tooltips / audit strings. */
  description: string;
  tone: Tone;
}

export interface AiFinding {
  id: string;
  kind:
    | 'mass'
    | 'calcification'
    | 'asymmetry'
    | 'architectural-distortion'
    | 'none';
  description: string;
  /** Free-text anatomical location, e.g. "upper outer quadrant". */
  location: string;
  /** Model probability estimate for the finding, 0..1. */
  probability: number;

  /* --- Structured class fields (present on flagged disagreements) --- */
  originalClass?: AiClassLabel;
  modelClass?: AiClassLabel;
  /** Model self-confidence in the original label, 0..1 (flagged findings only). */
  originalConfidence?: number;
}

export interface CaseImage {
  type: ImageType;
  /** URL the browser can fetch: either a PNG/JPG or a DICOM P10 file. */
  url: string;
  /** Native image size when known (PNG / DICOM rows x columns). */
  width?: number;
  height?: number;
  bitsAllocated?: number;
  transferSyntax?: string;
}

export interface PatientDemographics {
  id: string;
  sex: 'F' | 'M';
  ageAtStudy?: number;
}

export interface StudyInfo {
  studyInstanceUid: string;
  date: string; // ISO-8601 date, e.g. "2026-08-21"
  description: string;
  accessionNumber: string;
}

export interface AiPrediction {
  biradsGrade: BiRadsGrade;
  /** The model's coarse 3-class output (what the model actually emits). */
  predictedClass: AiClassLabel;
  /** Overall model confidence 0..1. */
  confidence: number;
  /** Probability mass over the supported BI-RADS grades, for display. */
  gradeProbabilities: Record<BiRadsGrade, number>;
  /** Real 3-class probabilities from the model OOF output. */
  classProbabilities: {
    normal: number;
    benignLeaning: number;
    suspicious: number;
  };
  findings: AiFinding[];
  model: string;
  modelVersion: string;
  /** ISO-8601 timestamp of the inference run. */
  runAt: string;
}

export interface AcquisitionInfo {
  laterality: Laterality;
  view: MammogramView;
  /** Pixel spacing in mm when DICOM spacing is available. */
  pixelSpacingMm?: number;
}

/** A single worklist entry: one image + its AI prediction waiting for review. */
export interface StudyCase {
  imageId: string;
  patient: PatientDemographics;
  study: StudyInfo;
  acquisition: AcquisitionInfo;
  image: CaseImage;
  ai: AiPrediction;
  /**
   * True when this image has **no AI label yet** (for example a dataset image
   * that has never been scored). The workbench then offers a *Predict label*
   * action instead of an assessment, and `ai.biradsGrade` is the BI-RADS 0
   * placeholder ("incomplete — needs additional evaluation").
   */
  needsPrediction?: boolean;
}

/** The exact payload the client POSTs and the server persists. */
export interface ValidationRecord {
  imageId: string;
  radiologistId: string;
  /** Label proposed by the AI model (BI-RADS string), e.g. "BI-RADS 4C". */
  originalLabel: string;
  /** Label agreed by the radiologist (same as original on approve). */
  finalLabel: string;
  status: ValidationStatus;
  notes: string;
  /** ISO-8601 timestamp of the decision. */
  timestamp: string;
}

export type SyncState = 'idle' | 'pending' | 'synced' | 'error';

/* ------------------------------------------------------------------ */
/* Multi-user backend (authentication + admin)                         */
/* ------------------------------------------------------------------ */

export type UserRole = 'admin' | 'radiologist';

/** Safe, serializable view of a user (never includes the password hash). */
export interface AppUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  specialty: string;
  active: boolean;
  createdAt: string;
}

/** A case-to-radiologist work assignment (one row per (case, reviewer)). */
export interface Assignment {
  imageId: string;
  radiologistId: string;
  assignedBy: string;
  assignedAt: string;
}

/** Admin-finalised ground-truth decision for an image. */
export interface CaseFinalization {
  imageId: string;
  finalLabel: string;
  rationale: string;
  decidedBy: string;
  finalizedAt: string;
}

/** Per-radiologist workload used by the Assignment Manager. */
export interface RadiologistWorkload {
  radiologistId: string;
  /** Current number of assigned images. */
  assigned: number;
  /** Number of submitted decisions. */
  completed: number;
}

export type BulkAssignmentAction = 'assign' | 'unassign';
export type BulkAssignmentMode = 'all' | 'balanced';

/** POST /api/admin/assignments/bulk body. */
export interface BulkAssignmentRequest {
  imageIds: string[];
  radiologistIds: string[];
  action?: BulkAssignmentAction;
  mode?: BulkAssignmentMode;
  /** Remove existing assignments for the selected cases first. */
  replaceExisting?: boolean;
  /** Compute and return the plan without writing anything. */
  dryRun?: boolean;
}

/** One reviewer's share of a bulk assignment. */
export interface BulkAssignmentTarget {
  radiologistId: string;
  assignedImages: number;
  patientGroups: number;
}

/** POST /api/admin/assignments/bulk response. */
export interface BulkAssignmentResponse {
  ok: boolean;
  dryRun: boolean;
  totalImages: number;
  totalGroups: number;
  targets: BulkAssignmentTarget[];
  message?: string;
}

/** Consensus state derived from the radiologist decisions for one image. */
export type ReviewStatus =
  | 'not_started'
  | 'consensus'
  | 'disagreement'
  | 'finalized';

/** Admin worklist row: a case plus its live assignment/decision snapshot. */
export interface AdminCaseView {
  imageId: string;
  patient: PatientDemographics;
  laterality: Laterality;
  view: MammogramView;
  needsPrediction: boolean;
  ai: {
    biradsGrade: BiRadsGrade;
    predictedClass: AiClassLabel;
    confidence: number;
  };
  assignedRadiologists: string[];
  decisions: number;
  reviewStatus: ReviewStatus;
  finalized: boolean;
}

/** One reviewed image with every radiologist decision, for admin arbitration. */
export interface CaseReview {
  imageId: string;
  patient: PatientDemographics;
  acquisition: AcquisitionInfo;
  needsPrediction: boolean;
  ai: {
    biradsGrade: BiRadsGrade;
    predictedClass: AiClassLabel;
    confidence: number;
  };
  decisions: Array<ValidationRecord & { radiologistName: string }>;
  reviewStatus: ReviewStatus;
  finalization: CaseFinalization | null;
}

export interface CasesApiResponse {
  cases: StudyCase[];
}

export interface ValidationApiResponse {
  ok: boolean;
  record: ValidationRecord;
  persistedCount: number;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Prediction (Mode 1 — label a PNG / DICOM)                          */
/* ------------------------------------------------------------------ */

export type DensityChoice = 'A' | 'B' | 'C' | 'D';

export interface PredictProbabilities {
  normal: number;
  benignLeaning: number;
  suspicious: number;
}

export interface PredictFoldResult {
  fold: number;
  label: number;
  probabilities: number[];
}

export interface PredictInput {
  file: string;
  age: number;
  densityCode: number;
}

/** Response of ``POST /api/predict`` (produced by ``ml/predict.py``). */
export interface PredictResponse {
  ok: boolean;
  label: number;
  labelName: string;
  /** Collapsed BI-RADS range, e.g. "BI-RADS 4-5". */
  biradsRange: string;
  confidence: number;
  probabilities: PredictProbabilities;
  folds: PredictFoldResult[];
  model: string;
  modelVersion: string;
  input: PredictInput;
  elapsedMs: number;
}

/** Ensemble health reported by ``GET /api/predict``. */
export interface PredictWorkerInfo {
  modelsConfigured: boolean;
  folds: number[];
  loaded: number;
  loadErrors: string[];
  missingKeys: number[];
  unexpectedKeys: number[];
  selectedFeatures: number[];
}

export interface PredictHealthResponse {
  ok: boolean;
  service?: string;
  worker?: PredictWorkerInfo;
  samples?: string[];
  message?: string;
}
