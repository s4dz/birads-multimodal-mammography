import { NextResponse } from 'next/server';

/**
 * Server-side application error with an HTTP status. Route handlers catch
 * `AppError` and convert it to an `{ ok: false, message }` JSON response so
 * the guard helpers stay one-liners.
 */
export class AppError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: error.status }
    );
  }
  console.error('[server] Unhandled error:', error);
  return NextResponse.json(
    { ok: false, message: 'Internal server error.' },
    { status: 500 }
  );
}