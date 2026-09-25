import { AI_CLASSES } from './taxonomy';
import type {
  AiClassIndex,
  AiClassLabel,
  AiPrediction,
  BiRadsGrade,
  PredictProbabilities,
  StudyCase,
  ValidationStatus,
} from './types';

/**
 * Pure helpers that convert a reviewed/final label string back into the
 * case's `ai` structure so the worklist can keep rendering it. The live model
 * only emits the coarse 3-class collapse (`AI_CLASSES`), so a relabel string
 * like "BI-RADS 4C — Suspicious abnormality — high suspicion" is mapped onto
 * the closest 3-class entry and a representative single grade.
 */

const KEY_BY_CLASS: Record<AiClassIndex, keyof PredictProbabilities> = {
  0: 'normal',
  1: 'benignLeaning',
  2: 'suspicious',
};

/** Representative single BI-RADS grade for each coarse class. */
export function representativeGrade(index: AiClassIndex): BiRadsGrade {
  switch (index) {
    case 0:
      return '1';
    case 1:
      return '2';
    default:
      return '4B';
  }
}

/** Best-effort map from any final-label string onto the 3 coarse classes. */
export function classFromLabel(label: string): AiClassIndex {
  const lower = label.toLowerCase();
  // Suspicious checks first: "4A/4C/biopsy/abnormality" must win over the
  // plain "2" and "4" substrings shared with other grades.
  if (
    ['suspicious', 'abnormality', 'biopsy', '4-5', '4a', '4b', '4c', '5'].some(
      (token) => lower.includes(token)
    )
  ) {
    return 2;
  }
  if (['benign', '2-3', 'lành'].some((token) => lower.includes(token))) {
    return 1;
  }
  if (/bi-?rads\s*[23]\b/.test(lower) || /\bworth\b/.test(lower)) {
    return 1;
  }
  return 0;
}

/** Supported single-grade BI-RADS codes that can be stored on a case. */
const GRADE_CODES = new Set([
  '0',
  '1',
  '2',
  '3',
  '4A',
  '4B',
  '4C',
  '5',
  '6',
]);

/** Extract "BI-RADS 4C" from a label string, or "" when absent/incoherent
 * (e.g. a coarse live-model range like "BI-RADS 4-5" has no single grade). */
export function gradeOfLabel(label: string): string {
  const match = label.match(/BI-?RADS\s*(\d[A-C]?)(?![\w-])/i);
  const code = match ? match[1].toUpperCase() : '';
  if (!GRADE_CODES.has(code)) return '';
  return `BI-RADS ${code}`;
}

/** Single BI-RADS grade code from a label string ("" when absent). */
function gradeCodeOf(label: string): string {
  const match = label.match(/BI-?RADS\s*(\d[A-C]?)(?![\w-])/i);
  const code = match ? match[1].toUpperCase() : '';
  return GRADE_CODES.has(code) ? code : '';
}

function zeroProbabilities(): PredictProbabilities {
  return { normal: 0, benignLeaning: 0, suspicious: 0 };
}

function zeroGradeProbabilities(): Record<BiRadsGrade, number> {
  const grades: BiRadsGrade[] = [
    '0',
    '1',
    '2',
    '3',
    '4A',
    '4B',
    '4C',
    '5',
    '6',
  ];
  return Object.fromEntries(grades.map((grade) => [grade, 0])) as Record<
    BiRadsGrade,
    number
  >;
}

/** Minimal `ai` for an uploaded case that has not been scored yet. */
export function placeholderAi(): AiPrediction {
  return {
    biradsGrade: '0',
    predictedClass: { index: 0, name: 'Unassessed', range: 'BI-RADS 0' },
    confidence: 0,
    gradeProbabilities: zeroGradeProbabilities(),
    classProbabilities: zeroProbabilities(),
    findings: [],
    model: '',
    modelVersion: '',
    runAt: new Date().toISOString(),
  };
}

export interface ApplyLabelOptions {
  finalLabel: string;
  status: ValidationStatus;
  /** Joint breast probabilities of a live predict; undefined for a relabel. */
  classProbabilities?: PredictProbabilities;
}

function predictedClassFor(label: string): AiClassLabel {
  const index = classFromLabel(label);
  const grade = gradeOfLabel(label) || `BI-RADS ${representativeGrade(index)}`;
  return { index, name: AI_CLASSES[index].name, range: AI_CLASSES[index].range, grade };
}

/**
 * Return a copy of `study` with its stored label set to the reviewed decision
 * (`needsPrediction` cleared, `ai` rewritten so the existing consumers keep
 * working). The full audit history stays in the `decisions` table.
 */
export function applyLabelToStudy(
  study: StudyCase,
  options: ApplyLabelOptions
): StudyCase {
  const index = classFromLabel(options.finalLabel);
  const grade = (gradeCodeOf(options.finalLabel) ||
    representativeGrade(index)) as BiRadsGrade;
  const probs =
    options.classProbabilities ??
    study.ai.classProbabilities ??
    zeroProbabilities();
  const resolved = probs[KEY_BY_CLASS[index]] ?? 0;
  const confidence = resolved > 0 ? resolved : study.ai.confidence || 0;
  const gradeProbabilities = zeroGradeProbabilities();
  gradeProbabilities[grade] = confidence;

  return {
    ...study,
    needsPrediction: false,
    ai: {
      ...study.ai,
      biradsGrade: grade,
      predictedClass: predictedClassFor(options.finalLabel),
      confidence,
      gradeProbabilities,
      classProbabilities: probs,
      runAt: new Date().toISOString(),
      labelSource: 'review',
    },
  };
}