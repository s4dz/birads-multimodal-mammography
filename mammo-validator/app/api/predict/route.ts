import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/app-error';
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

const PENDING_LINE_TIMEOUT_MS = 240_000; // model load + 4-fold CPU inference
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

const ALLOWED_UPLOAD_EXT = new Set(['.png', '.jpg', '.jpeg', '.dcm', '.dicom']);
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024; // mammograms are large

function samplesRoot(): string {
  return path.join(process.cwd(), 'public', 'samples');
}

/** Resolve a client-supplied sample path, refusing anything outside public/samples. */
function resolveSamplePath(relative: string): string {
  const root = path.resolve(samplesRoot());
  // Accept "/samples/png/x.png" (public URL) or "/png/x.png" (relative form).
  const cleaned = relative
    .replace(/^[/\\]+/, '')
    .replace(/^samples[/\\]/i, '');
  const target = path.resolve(root, cleaned);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Sample path must live inside public/samples.');
  }
  if (!existsSync(target)) {
    throw new Error(`Sample not found: ${relative}`);
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

/** Persist an uploaded PNG/DICOM so the Python process can read it. */
async function storeUpload(
  request: NextRequest
): Promise<Record<string, unknown>> {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new Error('No file was uploaded.');

  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_UPLOAD_EXT.has(extension)) {
    throw new Error(
      `Unsupported file type "${extension || file.name}". Use PNG, JPG or DICOM.`
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File is larger than 60 MB.');
  }

  const uploadDir = path.join(os.tmpdir(), 'mammo-predict');
  await mkdir(uploadDir, { recursive: true });
  const safeName = file.name.replace(/[^\w.-]/g, '_');
  const target = path.join(uploadDir, `${Date.now()}_${safeName}`);
  await writeFile(target, Buffer.from(await file.arrayBuffer()));

  return {
    image: target,
    age: form.get('age') ?? undefined,
    density: form.get('density') ?? undefined,
    cleanup: target,
  };
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireUser();
  } catch (error) {
    return toErrorResponse(error);
  }
  const contentType = request.headers.get('content-type') ?? '';
  let payload: Record<string, unknown>;

  try {
    if (contentType.includes('multipart/form-data')) {
      payload = await storeUpload(request);
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      payload = {
        image: resolveSamplePath(String(body.samplePath ?? '')),
        age: body.age,
        density: body.density,
      };
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Bad request.',
      },
      { status: 400 }
    );
  }

  try {
    const result = await worker().request(payload);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: String(result.error ?? 'Prediction failed.') },
        { status: 500 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : 'Prediction failed.',
      },
      { status: 500 }
    );
  } finally {
    const cleanup = payload.cleanup;
    if (typeof cleanup === 'string') {
      await rm(cleanup, { force: true }).catch(() => undefined);
    }
  }
}
