/**
 * Static application configuration.
 *
 * In a production deployment the radiologist identity would come from the
 * session / SSO token; here it is a fixed demo reviewer so the validation
 * payload schema stays complete.
 */

export const APP_CONFIG = {
  name: 'Mammo QA Workbench',
  shortName: 'MammoQA',
  version: '0.1.0',
} as const;

export type ReviewerProfile = {
  id: string;
  name: string;
  specialty: string;
};

export const REVIEWER_STORAGE_KEY = 'mammoqa.reviewer';

export const API_ENDPOINTS = {
  cases: '/api/cases',
  validation: '/api/validation',
} as const;
