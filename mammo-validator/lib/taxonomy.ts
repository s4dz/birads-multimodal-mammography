import type { AiClassIndex, BiRadsDescriptor, BiRadsGrade, Tone } from './types';

/**
 * ACR BI-RADS (5th/6th ed.) assessment categories used across the workbench.
 * Grade 4 is sub-divided into 4A/4B/4C which is the granularity the AI model
 * emits and what radiologists are asked to arbitrate.
 *
 * `tone` drives the severity colouring used in badges & the relabel picker.
 */
export const BI_RADS_TAXONOMY: readonly BiRadsDescriptor[] = [
  {
    grade: '0',
    label: 'BI-RADS 0',
    title: 'Incomplete',
    description: 'Need additional imaging evaluation',
    tone: 'neutral',
  },
  {
    grade: '1',
    label: 'BI-RADS 1',
    title: 'Negative',
    description: 'No suspicious findings',
    tone: 'positive',
  },
  {
    grade: '2',
    label: 'BI-RADS 2',
    title: 'Benign',
    description: 'Benign finding(s)',
    tone: 'low-risk',
  },
  {
    grade: '3',
    label: 'BI-RADS 3',
    title: 'Probably benign',
    description: 'Short-interval follow-up suggested',
    tone: 'watch',
  },
  {
    grade: '4A',
    label: 'BI-RADS 4A',
    title: 'Suspicious — low suspicion',
    description: 'Suspicious abnormality, low suspicion of malignancy',
    tone: 'suspicious',
  },
  {
    grade: '4B',
    label: 'BI-RADS 4B',
    title: 'Suspicious — moderate suspicion',
    description: 'Suspicious abnormality, moderate suspicion of malignancy',
    tone: 'suspicious',
  },
  {
    grade: '4C',
    label: 'BI-RADS 4C',
    title: 'Suspicious — high suspicion',
    description: 'Suspicious abnormality, high suspicion of malignancy',
    tone: 'critical',
  },
  {
    grade: '5',
    label: 'BI-RADS 5',
    title: 'Highly suggestive of malignancy',
    description: 'Highly suggestive of malignancy — biopsy recommended',
    tone: 'critical',
  },
  {
    grade: '6',
    label: 'BI-RADS 6',
    title: 'Known biopsy-proven malignancy',
    description: 'Known biopsy-proven malignancy',
    tone: 'critical',
  },
] as const;

const BY_GRADE = new Map<BiRadsGrade, BiRadsDescriptor>(
  BI_RADS_TAXONOMY.map((entry) => [entry.grade, entry])
);

/** Simple 3-class taxonomy optionally used for relabelling triage tasks. */
export const SIMPLE_TAXONOMY = [
  { key: 'Normal', title: 'Normal', tone: 'positive' as Tone },
  { key: 'Benign', title: 'Benign', tone: 'low-risk' as Tone },
  { key: 'Malignant', title: 'Malignant', tone: 'critical' as Tone },
];

/**
 * The model's 3 coarse output classes and the BI-RADS span each covers.
 * Displayed whenever model output is shown -- never a single synthetic grade.
 */
export const AI_CLASSES: Record<
  AiClassIndex,
  { name: string; range: string; tone: Tone; summary: string }
> = {
  0: {
    name: 'Normal',
    range: 'BI-RADS 1',
    tone: 'positive',
    summary: 'No suspicious findings',
  },
  1: {
    name: 'Benign-leaning',
    range: 'BI-RADS 2-3',
    tone: 'watch',
    summary: 'Probably benign — short-interval follow-up suggested',
  },
  2: {
    name: 'Suspicious',
    range: 'BI-RADS 4-5',
    tone: 'critical',
    summary: 'Suspicious abnormality — biopsy recommendation',
  },
};

export function toneForClass(index: AiClassIndex): Tone {
  return AI_CLASSES[index]?.tone ?? 'neutral';
}

export function classSummary(index: AiClassIndex): string {
  return AI_CLASSES[index]?.summary ?? '';
}

export function biradsDescriptor(grade: BiRadsGrade): BiRadsDescriptor {
  const found = BY_GRADE.get(grade);
  if (!found) {
    throw new Error(`Unknown BI-RADS grade "${grade}"`);
  }
  return found;
}

/** Human-readable audit string, e.g. "BI-RADS 4C — Suspicious — high suspicion". */
export function biradsAuditLabel(grade: BiRadsGrade): string {
  const d = biradsDescriptor(grade);
  return `${d.label} — ${d.title}`;
}

/**
 * Resolve a tone for an arbitrary final label string (BI-RADS or free-form
 * 3-class label such as "Malignant") so the UI can colour consistently.
 */
export function toneForLabel(label: string): Tone {
  const biradsMatch = label.match(/BI-RADS\s*(\d[A-C]?)/i);
  if (biradsMatch) {
    const grade = biradsMatch[1].toUpperCase() as BiRadsGrade;
    const found = BY_GRADE.get(grade);
    if (found) return found.tone;
  }
  const simple = SIMPLE_TAXONOMY.find((entry) => entry.key === label);
  return simple?.tone ?? 'neutral';
}

/** Tailwind classes for a given tone (bg / text / ring), used by badges. */
export function toneClasses(tone: Tone): { badge: string; dot: string } {
  switch (tone) {
    case 'positive':
      return {
        badge: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30',
        dot: 'bg-emerald-400',
      };
    case 'low-risk':
      return {
        badge: 'bg-teal-500/10 text-teal-300 ring-teal-400/30',
        dot: 'bg-teal-400',
      };
    case 'watch':
      return {
        badge: 'bg-amber-500/10 text-amber-300 ring-amber-400/30',
        dot: 'bg-amber-400',
      };
    case 'suspicious':
      return {
        badge: 'bg-orange-500/10 text-orange-300 ring-orange-400/30',
        dot: 'bg-orange-400',
      };
    case 'critical':
      return {
        badge: 'bg-rose-500/10 text-rose-300 ring-rose-400/40',
        dot: 'bg-rose-500',
      };
    default:
      return {
        badge: 'bg-slate-500/10 text-slate-300 ring-slate-400/30',
        dot: 'bg-slate-400',
      };
  }
}

export type LabelKind = 'birads' | 'simple';

export const TAXONOMY_MODE_LABELS: Record<LabelKind, string> = {
  birads: 'BI-RADS (ACR)',
  simple: '3-class triage',
};
