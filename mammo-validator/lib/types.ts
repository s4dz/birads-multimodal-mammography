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
  /** Overall model confidence 0..1. */
  confidence: number;
  /** Probability mass over the supported BI-RADS grades, for display. */
  gradeProbabilities: Record<BiRadsGrade, number>;
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
  modelsDir: string;
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
