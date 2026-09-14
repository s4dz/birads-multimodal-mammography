import { NextResponse } from 'next/server';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { getMockCases } from '@/lib/mock-data';
import type {
  BiRadsGrade,
  CasesApiResponse,
  MammogramView,
  StudyCase,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

const ZERO_GRADE_PROBABILITIES: Record<BiRadsGrade, number> = {
  '0': 0,
  '1': 0,
  '2': 0,
  '3': 0,
  '4A': 0,
  '4B': 0,
  '4C': 0,
  '5': 0,
  '6': 0,
};

/** e.g. "mg-2401_MLO_R.png" -> view MLO, laterality R */
const VIEW_PATTERN = /_([A-Z]{1,3})_([LR])\./i;

/**
 * Images that are present in `public/samples` but carry **no AI label yet**.
 *
 * These drive the "unlabeled -> predict -> approve" loop: review mode offers a
 * *Predict label* action that hands the image to `/predict`, and the returned
 * label can then be approved by the radiologist. `ai.biradsGrade` is the
 * BI-RADS 0 placeholder (incomplete — needs additional evaluation).
 */
function unlabeledCases(): StudyCase[] {
  const root = path.join(process.cwd(), 'public', 'samples');
  const cases: StudyCase[] = [];
  let index = 0;

  for (const folder of ['png', 'dicom'] as const) {
    const dir = path.join(root, folder);
    if (!existsSync(dir)) continue;

    for (const name of readdirSync(dir).sort()) {
      const isDicom = /\.(dcm|dicom)$/i.test(name);
      const isWebImage = /\.(png|jpe?g)$/i.test(name);
      if (!isDicom && !isWebImage) continue;

      index += 1;
      const match = name.match(VIEW_PATTERN);
      const view = (match?.[1]?.toUpperCase() ?? 'CC') as MammogramView;
      const laterality = (match?.[2]?.toUpperCase() ?? 'L') as 'L' | 'R';
      const suffix = String(index).padStart(2, '0');

      cases.push({
        imageId: name,
        patient: { id: `UNLABELED-${suffix}`, sex: 'F' },
        study: {
          studyInstanceUid: `unlabeled-${index}`,
          date: new Date().toISOString().slice(0, 10),
          description: 'Unlabeled — awaiting AI review',
          accessionNumber: `UNL-${String(index).padStart(3, '0')}`,
        },
        acquisition: { laterality, view },
        image: {
          type: isDicom ? 'dicom' : 'png',
          url: `/samples/${folder}/${name}`,
        },
        ai: {
          biradsGrade: '0',
          predictedClass: {
            index: 0,
            name: 'Normal',
            range: 'BI-RADS 1',
          },
          confidence: 0,
          gradeProbabilities: { ...ZERO_GRADE_PROBABILITIES },
          classProbabilities: {
            normal: 0,
            benignLeaning: 0,
            suspicious: 0,
          },
          findings: [],
          model: '',
          modelVersion: '',
          runAt: '',
        },
        needsPrediction: true,
      });
    }
  }

  return cases;
}

/**
 * Serves the worklist: the labelled VinDr-Mammo cases plus any local images that
 * still need a model label (`needsPrediction: true`).
 */
export async function GET(): Promise<NextResponse<CasesApiResponse>> {
  return NextResponse.json({ cases: [...getMockCases(), ...unlabeledCases()] });
}
