import { AI_CLASSES } from './taxonomy';
import type {
  AiClassIndex,
  Laterality,
  PredictProbabilities,
  StudyCase,
} from './types';

/**
 * Per-breast label fusion (mirrors the notebook's late-fusion max rule):
 * for one breast with CC + MLO views, ``P[c] = max(P_CC[c], P_MLO[c])`` and the
 * breast inherits the class with the highest fused probability. A breast with a
 * single view falls back to that view's own prediction — its label is still
 * treated as the breast label.
 */

export interface FusedViewDetail {
  view: string;
  index: AiClassIndex;
  name: string;
  range: string;
  confidence: number;
  probabilities: PredictProbabilities;
}

export interface FusedBreastLabel {
  laterality: Laterality;
  /** Views that participated (CC and/or MLO). */
  views: StudyCase[];
  index: AiClassIndex;
  name: string;
  range: string;
  confidence: number;
  probabilities: PredictProbabilities;
  perView: FusedViewDetail[];
}

const ZERO = { normal: 0, benignLeaning: 0, suspicious: 0 };

/** Class keys in AiClassIndex order (0/1/2). */
const CLASS_KEYS = ['normal', 'benignLeaning', 'suspicious'] as const;

function toProbability(p: PredictProbabilities): PredictProbabilities {
  return {
    normal: Number(p.normal) || 0,
    benignLeaning: Number(p.benignLeaning) || 0,
    suspicious: Number(p.suspicious) || 0,
  };
}

export function fuseBreastLabel(views: StudyCase[]): FusedBreastLabel | null {
  if (views.length === 0) return null;
  const laterality = views[0].acquisition.laterality;

  const perView: FusedViewDetail[] = views.map((view) => {
    const probabilities = toProbability(view.ai?.classProbabilities ?? ZERO);
    const index = argmax(probabilities);
    const info = AI_CLASSES[index];
    return {
      view: view.acquisition.view,
      index,
      name: info.name,
      range: info.range,
      confidence: probabilities[CLASS_KEYS[index]],
      probabilities,
    };
  });

  // A breast with no usable probabilities has nothing to fuse.
  if (perView.every((v) => v.confidence <= 0)) return null;

  const fused = perView.reduce<PredictProbabilities>(
    (acc, view) => ({
      normal: Math.max(acc.normal, view.probabilities.normal),
      benignLeaning: Math.max(
        acc.benignLeaning,
        view.probabilities.benignLeaning
      ),
      suspicious: Math.max(acc.suspicious, view.probabilities.suspicious),
    }),
    ZERO
  );

  const index = argmax(fused);
  const info = AI_CLASSES[index];
  return {
    laterality,
    views,
    index,
    name: info.name,
    range: info.range,
    confidence: fused[CLASS_KEYS[index]],
    probabilities: fused,
    perView,
  };
}

/** Index of the class with the highest probability (ties -> lower index). */
function argmax(probabilities: PredictProbabilities): AiClassIndex {
  const entries: [AiClassIndex, number][] = [
    [0, probabilities.normal],
    [1, probabilities.benignLeaning],
    [2, probabilities.suspicious],
  ];
  let best: AiClassIndex = 0;
  let bestValue = probabilities.normal;
  for (const [index, value] of entries) {
    if (value > bestValue) {
      best = index;
      bestValue = value;
    }
  }
  return best;
}