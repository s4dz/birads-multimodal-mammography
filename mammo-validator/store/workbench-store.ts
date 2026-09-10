import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { RADIOLOGIST } from '@/lib/config';
import { biradsAuditLabel } from '@/lib/taxonomy';
import type {
  StudyCase,
  SyncState,
  ValidationRecord,
} from '@/lib/types';

/**
 * Workbench state (Zustand).
 *
 * `cases`, `activeIndex` and `recordByImageId` form the image queue + active
 * validation. Decisions are applied optimistically so the UI is instant; each
 * decision is then POSTed to `/api/validation` and its per-image sync state is
 * tracked for the session summary.
 *
 * This store is client-only — import it exclusively from client components.
 */

export type NoticeKind = 'success' | 'error' | 'info';

export interface NoticeMessage {
  id: number;
  kind: NoticeKind;
  text: string;
}

interface WorkbenchState {
  cases: StudyCase[];
  isLoadingCases: boolean;
  casesError: string | null;

  activeIndex: number;

  /** Latest decision per image id (source of truth for the side panel). */
  recordByImageId: Record<string, ValidationRecord>;
  /** Server sync state per image id. */
  syncByImageId: Record<string, SyncState>;

  isRelabelOpen: boolean;
  notice: NoticeMessage | null;

  loadCases: () => Promise<void>;
  goToIndex: (index: number) => void;
  goToNext: () => void;
  goToPrev: () => void;
  goToNextPatientGroup: () => void;
  goToPrevPatientGroup: () => void;

  approveActive: () => Promise<void>;
  relabelActive: (finalLabel: string, notes: string) => Promise<void>;
  openRelabel: () => void;
  closeRelabel: () => void;

  dismissNotice: () => void;
}

let noticeSequence = 0;

function makeNotice(kind: NoticeKind, text: string): NoticeMessage {
  noticeSequence += 1;
  return { id: noticeSequence, kind, text };
}

function buildRecord(
  active: StudyCase,
  status: ValidationRecord['status'],
  finalLabel: string,
  notes: string
): ValidationRecord {
  return {
    imageId: active.imageId,
    radiologistId: RADIOLOGIST.id,
    originalLabel: biradsAuditLabel(active.ai.biradsGrade),
    finalLabel,
    status,
    notes,
    timestamp: new Date().toISOString(),
  };
}

export const useWorkbenchStore = create<WorkbenchState>()(
  subscribeWithSelector((set, get) => {
  /** Shared optimistic commit + server POST helper for approve / relabel. */
  async function commitDecision(record: ValidationRecord): Promise<void> {
    const { imageId } = record;
    set((state) => ({
      recordByImageId: { ...state.recordByImageId, [imageId]: record },
      syncByImageId: { ...state.syncByImageId, [imageId]: 'pending' },
      isRelabelOpen: false,
      notice: makeNotice(
        'success',
        record.status === 'APPROVED'
          ? `Approved AI label for ${imageId}`
          : `Relabelled ${imageId} → ${record.finalLabel}`
      ),
    }));

    try {
      const { submitValidation } = await import('@/lib/api-client');
      const response = await submitValidation(record);
      if (!response.ok) {
        throw new Error(
          response.message ?? 'Validation API rejected the record.'
        );
      }
      set((state) => ({
        syncByImageId: { ...state.syncByImageId, [imageId]: 'synced' },
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Network error while syncing.';
      set((state) => ({
        syncByImageId: { ...state.syncByImageId, [imageId]: 'error' },
        notice: makeNotice(
          'error',
          `Decision kept locally, but sync failed: ${message}`
        ),
      }));
    }
  }

  return {
    cases: [],
    isLoadingCases: false,
    casesError: null,
    activeIndex: 0,
    recordByImageId: {},
    syncByImageId: {},
    isRelabelOpen: false,
    notice: null,

    loadCases: async () => {
      if (get().isLoadingCases) return;
      set({ isLoadingCases: true, casesError: null });
      try {
        const { fetchCases } = await import('@/lib/api-client');
        const fetched = await fetchCases();
        if (fetched.length === 0) {
          throw new Error('Worklist is empty.');
        }
        // Sort by patient id so each patient's cases are contiguous. The
        // patient-grouping logic (startIndex/endIndex) requires contiguity;
        // without it the same patient appears in multiple groups. Stable sort
        // preserves within-patient order (CSV order = flag confidence).
        const cases = [...fetched].sort((a, b) =>
          a.patient.id < b.patient.id ? -1 : a.patient.id > b.patient.id ? 1 : 0,
        );
        set({ cases, isLoadingCases: false, activeIndex: 0 });
      } catch (error) {
        set({
          isLoadingCases: false,
          casesError:
            error instanceof Error
              ? error.message
              : 'Failed to load the worklist.',
        });
      }
    },

    goToIndex: (index) => {
      const { cases } = get();
      if (cases.length === 0) return;
      const clamped = Math.max(0, Math.min(cases.length - 1, index));
      set({ activeIndex: clamped });
    },

    goToNext: () => {
      const { cases, activeIndex } = get();
      if (activeIndex < cases.length - 1) {
        set({ activeIndex: activeIndex + 1 });
      }
    },

    goToPrev: () => {
      const { activeIndex } = get();
      if (activeIndex > 0) {
        set({ activeIndex: activeIndex - 1 });
      }
    },

    goToNextPatientGroup: () => {
      const state = get();
      if (state.cases.length === 0) return;
      const groups = selectPatientGroups(state);
      const activeGroup = groups.find(g => state.activeIndex >= g.startIndex && state.activeIndex <= g.endIndex);
      if (activeGroup) {
        const activeGroupIdx = groups.indexOf(activeGroup);
        if (activeGroupIdx < groups.length - 1) {
          set({ activeIndex: groups[activeGroupIdx + 1].startIndex });
        }
      }
    },

    goToPrevPatientGroup: () => {
      const state = get();
      if (state.cases.length === 0) return;
      const groups = selectPatientGroups(state);
      const activeGroup = groups.find(g => state.activeIndex >= g.startIndex && state.activeIndex <= g.endIndex);
      if (activeGroup) {
        const activeGroupIdx = groups.indexOf(activeGroup);
        if (activeGroupIdx > 0) {
          set({ activeIndex: groups[activeGroupIdx - 1].endIndex });
        }
      }
    },

    approveActive: async () => {
      const { cases, activeIndex, syncByImageId } = get();
      const active = cases[activeIndex];
      if (!active) return;
      if (syncByImageId[active.imageId] === 'pending') return;

      const record = buildRecord(
        active,
        'APPROVED',
        biradsAuditLabel(active.ai.biradsGrade),
        ''
      );
      await commitDecision(record);
    },

    relabelActive: async (finalLabel, notes) => {
      const { cases, activeIndex, syncByImageId } = get();
      const active = cases[activeIndex];
      if (!active) return;
      if (syncByImageId[active.imageId] === 'pending') return;

      const record = buildRecord(active, 'RELABELED', finalLabel, notes);
      await commitDecision(record);
    },

    openRelabel: () => {
      const active = get().cases[get().activeIndex];
      if (active) set({ isRelabelOpen: true });
    },

    closeRelabel: () => set({ isRelabelOpen: false }),

    dismissNotice: () => set({ notice: null }),
  };
})
);

/* ---------- Pure selectors (for component subscriptions) ---------- */

export function selectActiveCase(state: WorkbenchState): StudyCase | undefined {
  return state.cases[state.activeIndex];
}

export function selectActiveIndex(state: WorkbenchState): number {
  return state.activeIndex;
}

export function selectCaseCount(state: WorkbenchState): number {
  return state.cases.length;
}

export function selectDecisionFor(
  state: WorkbenchState,
  imageId: string
): ValidationRecord | undefined {
  return state.recordByImageId[imageId];
}

/* ---------- Patient grouping selectors ---------- */

export interface PatientGroup {
  patientId: string;
  patient: StudyCase['patient'];
  study: StudyCase['study'];
  cases: StudyCase[];
  startIndex: number;
  endIndex: number;
}

export function selectPatientGroups(state: WorkbenchState): PatientGroup[] {
  const { cases } = state;
  const groups: PatientGroup[] = [];
  let currentGroup: PatientGroup | null = null;

  cases.forEach((c, i) => {
    const pid = c.patient.id;
    if (!currentGroup || currentGroup.patientId !== pid) {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = {
        patientId: pid,
        patient: c.patient,
        study: c.study,
        cases: [],
        startIndex: i,
        endIndex: i,
      };
    }
    currentGroup.cases.push(c);
    currentGroup.endIndex = i;
  });

  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

export function selectActivePatientGroup(state: WorkbenchState): PatientGroup | undefined {
  const groups = selectPatientGroups(state);
  const activeIndex = state.activeIndex;
  return groups.find(g => activeIndex >= g.startIndex && activeIndex <= g.endIndex);
}

export function selectActiveCaseIndexInGroup(state: WorkbenchState): number {
  const group = selectActivePatientGroup(state);
  if (!group) return 0;
  return state.activeIndex - group.startIndex;
}

export function selectNextPatientGroupIndex(state: WorkbenchState): number | null {
  const groups = selectPatientGroups(state);
  const activeGroup = selectActivePatientGroup(state);
  if (!activeGroup) return null;
  const activeGroupIdx = groups.indexOf(activeGroup);
  if (activeGroupIdx < groups.length - 1) {
    return groups[activeGroupIdx + 1].startIndex;
  }
  return null;
}

export function selectPrevPatientGroupIndex(state: WorkbenchState): number | null {
  const groups = selectPatientGroups(state);
  const activeGroup = selectActivePatientGroup(state);
  if (!activeGroup) return null;
  const activeGroupIdx = groups.indexOf(activeGroup);
  if (activeGroupIdx > 0) {
    return groups[activeGroupIdx - 1].endIndex;
  }
  return null;
}
