/* eslint-disable no-console */
/**
 * Seed script — rebuilds the local SQLite database from scratch with:
 *   1. a flat set of demo accounts (1 admin + 4 radiologists),
 *   2. the full VinDr-Mammo research-flag dataset (MOCK_CASES),
 *   3. overlapping case assignments so the admin can demo consensus and
 *      disagreement arbitration.
 *
 * Run: npm run db:seed
 */

import { resetDatabase } from '../lib/db';
import { listAllCaseStudies } from '../lib/db-repository';
import { assignCase, createUser, insertCases } from '../lib/db-repository';
import { MOCK_CASES } from '../lib/mock-data';
import { hashPassword } from '../lib/session';

const ADMIN_PASSWORD = 'admin123';
const RADIOLOGIST_PASSWORD = 'rad123';

/** Slice indices of the contiguous patient groups handed to each reviewer. */
const RADIOLOGIST_GROUPS: Record<string, number[]> = {
  rad_01: [0, 1, 2, 3, 4, 5],
  rad_02: [3, 4, 5, 6, 7, 8],
  rad_03: [6, 7, 8, 9],
};

function main(): void {
  resetDatabase();

  const admin = createUser({
    id: 'user_admin',
    username: 'admin',
    name: 'Admin',
    passwordHash: hashPassword(ADMIN_PASSWORD),
    role: 'admin',
    specialty: 'Administration',
  });
  console.log(`✓ admin "${admin.username}" created`);

  const radiologists = [
    { id: 'rad_01', username: 'radiologist_01', name: 'Alana Reyes', specialty: 'Breast Imaging' },
    { id: 'rad_02', username: 'radiologist_02', name: 'Minh Tran', specialty: 'Breast Imaging' },
    { id: 'rad_03', username: 'radiologist_03', name: 'Sofia Novak', specialty: 'General Radiology' },
    { id: 'rad_04', username: 'radiologist_04', name: 'Daniel Osei', specialty: 'General Radiology' },
  ];
  for (const radiologist of radiologists) {
    createUser({
      id: radiologist.id,
      username: radiologist.username,
      name: radiologist.name,
      passwordHash: hashPassword(RADIOLOGIST_PASSWORD),
      role: 'radiologist',
      specialty: radiologist.specialty,
    });
  }
  console.log(`✓ ${radiologists.length} radiologists created`);
  console.log(`  demo credentials: admin/${ADMIN_PASSWORD}, radiologist_01..04/${RADIOLOGIST_PASSWORD}`);

  const inserted = insertCases(MOCK_CASES);
  console.log(`✓ ${inserted} cases seeded from MOCK_CASES`);

  /* Contiguous patient groups (the workbench sorts patients contiguously). */
  const groups: string[][] = [];
  let currentGroup: string[] = [];
  let currentPatient: string | null = null;
  for (const study of MOCK_CASES) {
    if (study.patient.id !== currentPatient) {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [];
      currentPatient = study.patient.id;
    }
    currentGroup.push(study.imageId);
  }
  if (currentGroup.length > 0) groups.push(currentGroup);
  console.log(`✓ ${groups.length} patient groups`);

  for (const [id, indices] of Object.entries(RADIOLOGIST_GROUPS)) {
    let count = 0;
    for (const index of indices) {
      for (const imageId of groups[index] ?? []) {
        assignCase(imageId, id, admin.id);
        count += 1;
      }
    }
    console.log(`✓ ${id}: assigned ${count} images`);
  }

  const total = listAllCaseStudies().length;
  console.log(`\nDone. ${total} cases ready; every login now goes through /login.`);
}

main();