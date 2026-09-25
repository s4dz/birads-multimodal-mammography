import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import { requireUser } from '@/lib/auth';

/**
 * `/api/predict` — runs the PyTorch + CatBoost ensemble in `ml/predict.py`.
 *
 * The Python worker is started once in `--serve` mode and kept warm, because
 * loading the four fold checkpoints takes ~10s while inference itself adds
 * another ~10s on CPU. Requests are serialised so the line-delimited protocol
 * stays unambiguous.
 *
 * Node runtime is required (child_process); Edge is not supported.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* ------------------------------------------------------------------ */
/* Python worker                                                       */
/* ------------------------------------------------------------------ */

const PENDING_LINE_TIMEOUT_MS = 65_000; // per-request Python call (warm worker)
const STACK_TRACE_TAIL = 4_000;

type WorkerResponse = Record<string, unknown> & { ok: boolean; error?: string };

class PredictWorker {
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<void> | null = null;
  private stdoutBuffer = '';
  private stderrTail = '';
  private pendingLine: ((line: string) => void) | null = null;
  /** Serialises requests: one line out, one line in. */
  private chain: Promise<unknown> = Promise.resolve();

  private get python(): string {
    const configured = process.env.MAMMO_PYTHON?.trim();
    if (configured) return configured;
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  private get scriptPath(): string {
    return path.join(process.cwd(), 'ml', 'predict.py');
  }

  private get modelsDir(): string {
    return process.env.MAMMO_MODELS_DIR?.trim() ?? '';
  }

  private ensureStarted(): Promise<void> {
    if (this.child && this.child.exitCode === null) return Promise.resolve();
    if (this.starting) return this.starting;

    const script = this.scriptPath;
    if (!existsSync(script)) {
      return Promise.reject(
        new Error(`Prediction script not found at ${script}`)
      );
    }

    const args = [script, '--serve'];
    if (this.modelsDir) {
      args.push('--models-dir', this.modelsDir);
    }

    const started = new Promise<void>((resolve, reject) => {
      const child = spawn(this.python, args, {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        windowsHide: true,
      }) as ChildProcessWithoutNullStreams;

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      child.stdout.on('data', (chunk: string) => this.consumeStdout(chunk));
      child.stderr.on('data', (chunk: string) => {
        this.stderrTail = (this.stderrTail + chunk).slice(-STACK_TRACE_TAIL);
      });
      child.on('error', (error) => {
        this.child = null;
        this.starting = null;
        reject(
          new Error(
            `Could not start the Python worker (${this.python}): ${error.message}`
          )
        );
      });
      child.on('exit', () => {
        this.child = null;
        this.starting = null;
        const pending = this.pendingLine;
        this.pendingLine = null;
        pending?.('');
      });

      this.child = child;
      this.starting = null;
      resolve();
    });

    this.starting = started;
    void started.catch(() => {
      this.starting = null;
    });
    return started;
  }

  private consumeStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line) {
        const resolver = this.pendingLine;
        this.pendingLine = null;
        resolver?.(line);
      }
      newlineIndex = this.stdoutBuffer.indexOf('\n');
    }
  }

  /** Send one request object and resolve with the parsed response line. */
  request(payload: Record<string, unknown>): Promise<WorkerResponse> {
    const run = this.chain.then(() => this.execute(payload));
    this.chain = run.catch(() => undefined); // keep the chain alive
    return run;
  }

  private async execute(
    payload: Record<string, unknown>
  ): Promise<WorkerResponse> {
    await this.ensureStarted();
    const child = this.child;
    if (!child) {
      throw new Error(
        `Python worker is not running. ${this.stderrTail.trim().slice(-400)}`
      );
    }

    const responseLine = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingLine = null;
        reject(
          new Error(
            `Prediction timed out after ${PENDING_LINE_TIMEOUT_MS / 1000}s.`
          )
        );
      }, PENDING_LINE_TIMEOUT_MS);

      this.pendingLine = (line: string) => {
        clearTimeout(timer);
        if (!line) {
          reject(
            new Error(
              `Python worker stopped. ${this.stderrTail.trim().slice(-600)}`
            )
          );
          return;
        }
        resolve(line);
      };
    });

    child.stdin.write(`${JSON.stringify(payload)}\n`);

    const line = await responseLine;
    try {
      return JSON.parse(line) as WorkerResponse;
    } catch {
      throw new Error(`Worker returned malformed JSON: ${line.slice(0, 300)}`);
    }
  }
}

const globalForPredict = globalThis as unknown as {
  __mammoPredictWorker?: PredictWorker;
};

function worker(): PredictWorker {
  if (!globalForPredict.__mammoPredictWorker) {
    globalForPredict.__mammoPredictWorker = new PredictWorker();
  }
  return globalForPredict.__mammoPredictWorker;
}

/* ------------------------------------------------------------------ */
/* Samples + routes                                                    */
/* ------------------------------------------------------------------ */

function samplesRoot(): string {
  return path.join(process.cwd(), 'public', 'samples');
}

function uploadsRoot(): string {
  return path.join(process.cwd(), 'public', 'uploads');
}

/**
 * Resolve a client-supplied image path to disk, refusing anything outside the
 * two image roots. Accepts public URLs ("/samples/png/x.png",
 * "/uploads/x.png"), their prefix-less forms and raw relative paths.
 */
function resolveImagePath(relative: string): string {
  const cleaned = relative
    .replace(/^[/\\]+/, '')
    .replace(/^public[/\\]/i, '')
    .replace(/\\/g, '/');
  const isUpload = cleaned.toLowerCase().startsWith('uploads/');
  const root = path.resolve(isUpload ? uploadsRoot() : samplesRoot());
  const rest = isUpload
    ? cleaned.slice('uploads/'.length)
    : cleaned.replace(/^samples[/\\]/i, '');
  const target = path.resolve(root, rest);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(
      `Image path must live inside public/${isUpload ? 'uploads' : 'samples'}.`
    );
  }
  if (!existsSync(target)) {
    throw new Error(`Image not found: ${relative}`);
  }
  return target;
}

/** A short deterministic list for the "pick a sample" picker. */
async function listSamples(): Promise<string[]> {
  const root = samplesRoot();
  const collected: string[] = [];
  for (const folder of ['png', 'cl']) {
    const dir = path.join(root, folder);
    if (!existsSync(dir)) continue;
    const entries = (await readdir(dir))
      .filter((name) => /\.(png|jpe?g|dcm|dicom)$/i.test(name))
      .sort();
    for (const name of entries.slice(0, 8)) {
      collected.push(`/samples/${folder}/${name}`);
    }
  }
  return collected;
}

/** GET -> worker/model health plus a few bundled samples for the picker. */
export async function GET(): Promise<NextResponse> {
  try {
    await requireUser();
  } catch (error) {
    return toErrorResponse(error);
  }
  try {
    const description = await worker().request({ command: 'describe' });
    return NextResponse.json({
      ok: true,
      service: 'predict',
      worker: description,
      samples: await listSamples(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : 'Prediction worker unavailable.',
        samples: await listSamples().catch(() => []),
      },
      { status: 503 }
    );
  }
}

/** Acceptable multipart file roles: "<side>_<view>" with side in {l, r}. */
const UPLOAD_ROLES = ['l_cc', 'l_mlo', 'r_cc', 'r_mlo'] as const;
const IMAGE_SUFFIX = /\.(png|jpe?g|dcm|dicom)$/i;

interface BreastPair {
  laterality: string;
  image_cc: string;
  image_mlo: string;
}

function parseClinical(
  ageValue: unknown,
  densityValue: unknown
): { age?: number; density?: string } {
  const age =
    typeof ageValue === 'number' ? ageValue : Number.parseFloat(String(ageValue ?? ''));
  return {
    age: Number.isFinite(age) && age > 0 && age <= 120 ? age : undefined,
    density: String(densityValue ?? 'C').trim().toUpperCase(),
  };
}

/** Write an uploaded file to the request temp folder (extension preserved). */
async function saveUpload(
  folder: string,
  role: string,
  upload: File
): Promise<string> {
  if (!IMAGE_SUFFIX.test(upload.name)) {
    throw new AppError(
      400,
      `Unsupported file "${upload.name}". Use PNG, JPG or DICOM.`
    );
  }
  const extension = path.extname(upload.name) || '.png';
  const target = path.join(folder, `${role}${extension}`);
  await writeFile(target, Buffer.from(await upload.arrayBuffer()));
  return target;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireUser();
  } catch (error) {
    return toErrorResponse(error);
  }
  const contentType = request.headers.get('content-type') ?? '';
  const isMultipart = contentType.includes('multipart/form-data');

  let payload: Record<string, unknown> | null = null;
  const foldersToClean: string[] = [];

  try {
    if (isMultipart) {
      const form = await request.formData();
      const folder = await mkdtemp(path.join(tmpdir(), 'mammo-predict-'));
      foldersToClean.push(folder);

      const saved = new Map<string, string>();
      for (const role of UPLOAD_ROLES) {
        const upload = form.get(role);
        if (upload instanceof File && upload.size > 0) {
          saved.set(role, await saveUpload(folder, role, upload));
        }
      }

      const breasts: BreastPair[] = [];
      for (const side of ['L', 'R'] as const) {
        const prefix = side.toLowerCase();
        const cc = saved.get(`${prefix}_cc`);
        const mlo = saved.get(`${prefix}_mlo`);
        if (cc && mlo) {
          breasts.push({ laterality: side, image_cc: cc, image_mlo: mlo });
        } else if (cc || mlo) {
          throw new AppError(
            400,
            `Uploaded one view of breast ${side} but not the other: ${side === 'L' ? 'l_cc' : 'r_cc'} and ${side === 'L' ? 'l_mlo' : 'r_mlo'} are both required.`
          );
        }
      }
      if (breasts.length === 0) {
        throw new AppError(
          400,
          'Upload at least one complete breast (CC + MLO). File roles: l_cc, l_mlo, r_cc, r_mlo.'
        );
      }

      const clinical = parseClinical(form.get('age'), form.get('density'));
      payload = { breasts };
      if (clinical.age !== undefined) payload.age = clinical.age;
      if (clinical.density) payload.density = clinical.density;
    } else {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        throw new AppError(
          400,
          'Invalid JSON body. Send {age, density, breasts:[{laterality, sampleCC, sampleMLO}]}.'
        );
      }

      const clinical = parseClinical(body.age, body.density);
      const requested = Array.isArray(body.breasts)
        ? (body.breasts as Record<string, unknown>[])
        : null;

      const breasts: BreastPair[] = [];
      if (requested && requested.length > 0) {
        if (requested.length > 2) {
          throw new AppError(400, 'At most 2 breasts can be scored per request.');
        }
        for (const breast of requested) {
          const laterality = String(breast.laterality ?? '').trim().toUpperCase();
          if (laterality !== 'L' && laterality !== 'R') {
            throw new AppError(
              400,
              'Each breast needs a valid laterality ("L" or "R").'
            );
          }
          const ccRaw = String(breast.sampleCC ?? '').trim();
          const mloRaw = String(breast.sampleMLO ?? '').trim();
          if (!ccRaw || !mloRaw) {
            throw new AppError(
              400,
              `Breast ${laterality} needs both sampleCC and sampleMLO.`
            );
          }
          breasts.push({
            laterality,
            image_cc: resolveImagePath(ccRaw),
            image_mlo: resolveImagePath(mloRaw),
          });
        }
      } else {
        const ccRaw = String(body.samplePathCC ?? '').trim();
        const mloRaw = String(body.samplePathMLO ?? '').trim();
        if (!ccRaw || !mloRaw) {
          throw new AppError(
            400,
            'Both samplePathCC and samplePathMLO are required.'
          );
        }
        breasts.push({
          laterality: '',
          image_cc: resolveImagePath(ccRaw),
          image_mlo: resolveImagePath(mloRaw),
        });
      }

      payload = { breasts };
      if (clinical.age !== undefined) payload.age = clinical.age;
      if (clinical.density !== undefined) payload.density = clinical.density;
    }

    const result = await worker().request(payload ?? {});
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: String(result.error ?? 'Prediction failed.') },
        { status: 500 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return toErrorResponse(error);
    }
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Prediction failed.',
      },
      { status: 500 }
    );
  } finally {
    for (const folder of foldersToClean) {
      await rm(folder, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
