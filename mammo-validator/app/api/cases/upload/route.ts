import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import { requireAdmin } from '@/lib/auth';
import { getCaseStudy, insertCases } from '@/lib/db-repository';
import { placeholderAi } from '@/lib/label-persist';
import type {
  Laterality,
  MammogramView,
  PatientDemographics,
  StudyCase,
  UploadCasesResponse,
  UploadedCaseInfo,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/cases/upload — admin uploads new mammogram pairs into the dataset.
 *
 * Multipart fields (`<side>_<view>` with side in {l, r}) plus optional
 * patient_id / patient_sex / patient_age. Each uploaded PNG/JPG/DICOM file is
 * stored under `public/uploads/<hash><ext>` (SHA-256 of the bytes) so re-upload
 * of the same file is idempotent, and two StudyCases (CC + MLO sharing the
 * patient) are created with `needsPrediction = true` — ready for the “Predict
 * this label” → approve flow in review mode.
 */

const UPLOAD_ROLES = ['l_cc', 'l_mlo', 'r_cc', 'r_mlo'] as const;
const IMAGE_SUFFIX = /\.(png|jpe?g|dcm|dicom)$/i;

function uploadsRoot(): string {
  return path.join(process.cwd(), 'public', 'uploads');
}

function imageTypeFor(fileName: string): 'dicom' | 'png' {
  return /\.(dcm|dicom)$/i.test(fileName) ? 'dicom' : 'png';
}

function generatePatientId(): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `up-${stamp}${rand}`;
}

interface SavedImage {
  imageId: string;
  url: string;
  type: 'dicom' | 'png';
}

async function saveFile(file: File): Promise<SavedImage> {
  if (!IMAGE_SUFFIX.test(file.name)) {
    throw new AppError(
      400,
      `Unsupported file "${file.name}". Use PNG, JPG or DICOM.`
    );
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = path.extname(file.name).toLowerCase() || '.png';
  const imageId = `${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}${extension}`;
  const root = uploadsRoot();
  await mkdir(root, { recursive: true });
  const target = path.join(root, imageId);
  if (!existsSync(target)) {
    await writeFile(target, bytes);
  }
  return { imageId, url: `/uploads/${imageId}`, type: imageTypeFor(imageId) };
}

function buildCase(input: {
  imageId: string;
  url: string;
  type: 'dicom' | 'png';
  patient: PatientDemographics;
  laterality: Laterality;
  view: MammogramView;
}): StudyCase {
  return {
    imageId: input.imageId,
    patient: input.patient,
    study: {
      studyInstanceUid: input.imageId,
      date: new Date().toISOString().slice(0, 10),
      description: 'Uploaded case',
      accessionNumber: '—',
    },
    acquisition: { laterality: input.laterality, view: input.view },
    image: { type: input.type, url: input.url },
    ai: placeholderAi(),
    needsPrediction: true,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin();
    const form = await request.formData();

    const rawPatientId = String(form.get('patient_id') ?? '').trim();
    const sex: 'F' | 'M' =
      String(form.get('patient_sex') ?? 'F').trim().toUpperCase() === 'M'
        ? 'M'
        : 'F';
    const rawAge = Number.parseFloat(String(form.get('patient_age') ?? ''));
    const ageAtStudy =
      Number.isFinite(rawAge) && rawAge > 0 && rawAge <= 120
        ? rawAge
        : undefined;
    const patient: PatientDemographics = {
      id: rawPatientId || generatePatientId(),
      sex,
      ageAtStudy,
    };

    const saved = new Map<string, SavedImage>();
    for (const role of UPLOAD_ROLES) {
      const file = form.get(role);
      if (file instanceof File && file.size > 0) {
        saved.set(role, await saveFile(file));
      }
    }

    const cases: StudyCase[] = [];
    const info: UploadedCaseInfo[] = [];
    const duplicates: string[] = [];
    for (const side of ['L', 'R'] as const) {
      const prefix = side.toLowerCase();
      const cc = saved.get(`${prefix}_cc`);
      const mlo = saved.get(`${prefix}_mlo`);
      if (!cc && !mlo) continue;
      if (!cc || !mlo) {
        throw new AppError(
          400,
          `Uploaded one view of breast ${side} but not the other: ${prefix}_cc and ${prefix}_mlo are both required.`
        );
      }
      if (cc.imageId === mlo.imageId) {
        throw new AppError(
          400,
          `CC and MLO of breast ${side} must be different files (same content uploaded twice).`
        );
      }
      for (const [source, view] of [
        [cc, 'CC'],
        [mlo, 'MLO'],
      ] as const) {
        if (getCaseStudy(source.imageId)) {
          duplicates.push(source.imageId);
          continue;
        }
        const study = buildCase({
          imageId: source.imageId,
          url: source.url,
          type: source.type,
          patient,
          laterality: side,
          view,
        });
        cases.push(study);
        info.push({
          imageId: study.imageId,
          url: study.image.url,
          view,
          laterality: side,
        });
      }
    }

    if (cases.length === 0 && duplicates.length === 0) {
      throw new AppError(
        400,
        'Upload at least one complete breast (CC + MLO). File roles: l_cc, l_mlo, r_cc, r_mlo.'
      );
    }
    if (cases.length > 0) {
      insertCases(cases);
    }

    const payload: UploadCasesResponse = {
      ok: true,
      cases: info,
      duplicates,
      count: info.length,
    };
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}