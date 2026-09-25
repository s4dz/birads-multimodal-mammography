/**
 * Static application configuration.
 */

import type { UserRole } from './types';

export const APP_CONFIG = {
  name: 'Mammo QA Workbench',
  shortName: 'MammoQA',
  version: '0.1.0',
} as const;

export type ReviewerProfile = {
  id: string;
  name: string;
  specialty: string;
  role: UserRole;
};

export const API_ENDPOINTS = {
  cases: '/api/cases',
  caseUpload: '/api/cases/upload',
  validation: '/api/validation',
  predict: '/api/predict',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  me: '/api/auth/me',
  adminUsers: '/api/admin/users',
  adminCases: '/api/admin/cases',
  adminAssignments: '/api/admin/assignments',
  adminAssignmentBulk: '/api/admin/assignments/bulk',
  adminAssignmentStats: '/api/admin/assignments/stats',
  adminReviews: '/api/admin/reviews',
  adminFinalize: '/api/admin/finalize',
} as const;
