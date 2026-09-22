import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite connection (Node built-in `node:sqlite`) + schema.
 *
 * Server-only module: imported exclusively by route handlers, the proxy
 * guard-through helpers and the seed script. The database lives on disk at
 * `data/mammoqa.db` (git-ignored) and is opened lazily as a process-wide
 * singleton so every request shares one connection.
 */

export const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'mammoqa.db');

export function resolveDbPath(): string {
  return process.env.MAMMO_DB_PATH ?? DEFAULT_DB_PATH;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'radiologist')),
  specialty     TEXT NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  image_id         TEXT PRIMARY KEY,
  patient_id       TEXT NOT NULL,
  patient_sex      TEXT NOT NULL DEFAULT 'F',
  patient_age      INTEGER,
  laterality       TEXT NOT NULL DEFAULT '',
  view             TEXT NOT NULL DEFAULT '',
  needs_prediction INTEGER NOT NULL DEFAULT 0 CHECK (needs_prediction IN (0, 1)),
  payload_json     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  image_id        TEXT NOT NULL REFERENCES cases(image_id) ON DELETE CASCADE,
  radiologist_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by     TEXT NOT NULL REFERENCES users(id),
  assigned_at     TEXT NOT NULL,
  PRIMARY KEY (image_id, radiologist_id)
);

CREATE TABLE IF NOT EXISTS decisions (
  image_id        TEXT NOT NULL REFERENCES cases(image_id) ON DELETE CASCADE,
  radiologist_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_label  TEXT NOT NULL,
  final_label     TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('APPROVED', 'RELABELED')),
  notes           TEXT NOT NULL DEFAULT '',
  timestamp       TEXT NOT NULL,
  PRIMARY KEY (image_id, radiologist_id)
);

CREATE TABLE IF NOT EXISTS case_finalizations (
  image_id       TEXT PRIMARY KEY REFERENCES cases(image_id) ON DELETE CASCADE,
  final_label    TEXT NOT NULL,
  rationale      TEXT NOT NULL DEFAULT '',
  decided_by     TEXT NOT NULL REFERENCES users(id),
  finalized_at   TEXT NOT NULL,
  snapshot_json  TEXT NOT NULL
);
`;

let connection: DatabaseSync | null = null;

/** Lazily open (and create) the SQLite database for this process. */
export function getDb(): DatabaseSync {
  if (!connection) {
    const file = resolveDbPath();
    mkdirSync(path.dirname(file), { recursive: true });
    connection = new DatabaseSync(file);
    connection.exec(SCHEMA);
  }
  return connection;
}

/** Drop every table — used by the seed script to rebuild from scratch. */
export function resetDatabase(): void {
  const db = getDb();
  db.exec(`
    DROP TABLE IF EXISTS case_finalizations;
    DROP TABLE IF EXISTS decisions;
    DROP TABLE IF EXISTS assignments;
    DROP TABLE IF EXISTS cases;
    DROP TABLE IF EXISTS users;
  `);
  db.exec(SCHEMA);
}

export function closeDb(): void {
  connection?.close();
  connection = null;
}