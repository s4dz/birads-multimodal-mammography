import { AppError } from './app-error';

/**
 * Lightweight in-memory login rate limiter (fixed-window).
 *
 * This is deliberately dependency-free and per-process: good enough to blunt
 * brute-force floods in a single-instance deployment. Distributed deployments
 * should move the counters to a shared store (e.g. Redis) — see README note.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_KEYS = 10_000;

interface AttemptEntry {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

const attempts = new Map<string, AttemptEntry>();

function pruneExpired(): void {
  if (attempts.size < MAX_KEYS) return;
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now > entry.windowStart + WINDOW_MS && entry.lockedUntil <= now) {
      attempts.delete(key);
    }
  }
}

/**
 * Throws 429 while the key is locked out. Intended to be called at the very
 * start of the login handler so locked-out clients are rejected before any
 * password work happens.
 */
export function assertNotLocked(key: string): void {
  pruneExpired();
  const entry = attempts.get(key);
  if (!entry) return;
  const now = Date.now();
  if (now < entry.lockedUntil) {
    const minutes = Math.ceil((entry.lockedUntil - now) / 60_000);
    throw new AppError(
      429,
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
    );
  }
}

/** Record one failed attempt for the key; locks the key at the threshold. */
export function registerFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.windowStart + WINDOW_MS) {
    attempts.set(key, { failures: 1, windowStart: now, lockedUntil: 0 });
    return;
  }
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
}

/** Clear a key's counters after a successful login. */
export function resetFailures(key: string): void {
  attempts.delete(key);
}