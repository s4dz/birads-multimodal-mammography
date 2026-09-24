import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { type ReviewerProfile } from '@/lib/config';
import { biradsAuditLabel } from '@/lib/taxonomy';
import { fuseBreastLabel } from '@/lib/breast-fusion';
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

/**
 * Backend session state. `reviewer` is populated only from the authenticated
 * `/api/auth/me` user; the browser-local reviewer identity has been removed —
 * the backend is the source of truth.
 */
export type SessionState = 'idle' | 'loading' | 'authed' | 'anonymous';

interface WorkbenchState {
  cases: StudyCase[];
  isLoadingCases: boolean;
  casesError: string | null;

  activeIndex: number;

  /** Backend-authenticated reviewer identity for this session. */
  reviewer: ReviewerProfile | null;
  sessionState: SessionState;

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

  /** Resolve the reviewer from the backend session cookie. */
  refreshSession: () => Promise<void>;
  /** Log out (clears the session cookie server-side). */
  logout: () => Promise<void>;

  /** Pull decisions already recorded on the server into local state. */
  hydrateDecisions: () => Promise<void>;

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

/**
 * Build one decision record per view of a single breast. status, finalLabel,
 * notes, radiologistId and timestamp are shared across the breast's CC + MLO
 * views; originalLabel stays per-view (each image carries its own AI label).
 */
function buildBreastRecords(
  views: StudyCase[],
  status: ValidationRecord['status'],
  finalLabel: string,
  notes: string,
  radiologistId: string
): ValidationRecord[] {
  const timestamp = new Date().toISOString();
  return views.map((c) => ({
    imageId: c.imageId,
    radiologistId,
    originalLabel: c.needsPrediction ? 'Unlabeled' : biradsAuditLabel(c.ai.biradsGrade),
    finalLabel,
    status,
    notes,
    timestamp,
  }));
}

export const useWorkbenchStore = create<WorkbenchState>()(
  subscribeWithSelector((set, get) => {
  /** Shared optimistic commit + server POST helper for approve / relabel. */
  async function commitDecision(records: ValidationRecord[]): Promise<void> {
    const { submitValidation } = await import('@/lib/api-client');
    const imageIds = records.map((r) => r.imageId);
    set((state) => {
      const recordByImageId = { ...state.recordByImageId };
      const syncByImageId = { ...state.syncByImageId };
      for (const record of records) {
        recordByImageId[record.imageId] = record;
        syncByImageId[record.imageId] = 'pending';
      }
      return {
        recordByImageId,
        syncByImageId,
        isRelabelOpen: false,
        notice: makeNotice(
          'success',
          records.length === 1
            ? records[0].status === 'APPROVED'
              ? `Approved AI label for ${records[0].imageId}`
              : `Relabeled ${records[0].imageId} → ${records[0].finalLabel}`
            : records[0].status === 'APPROVED'
              ? `Approved AI label for breast · ${records.length} views`
              : `Relabeled breast → ${records[0].finalLabel} · ${records.length} views`
        ),
      };
    });

    try {
      const responses = await Promise.all(
        records.map((record) => submitValidation(record))
      );
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        throw new Error(
          failed.message ?? 'Validation API rejected the record.'
        );
      }
      set((state) => {
        const syncByImageId = { ...state.syncByImageId };
        for (const imageId of imageIds) {
          syncByImageId[imageId] = 'synced';
        }
        return { syncByImageId };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Network error while syncing.';
      set((state) => {
        const syncByImageId = { ...state.syncByImageId };
        for (const imageId of imageIds) {
          syncByImageId[imageId] = 'error';
        }
        return {
          syncByImageId,
          notice: makeNotice(
            'error',
            `Decision kept locally, but sync failed: ${message}`
          ),
        };
      });
    }
  }

  return {
    cases: [],
    isLoadingCases: false,
    casesError: null,
    activeIndex: 0,
    reviewer: null,
    sessionState: 'idle',
    recordByImageId: {},
    syncByImageId: {},
    isRelabelOpen: false,
    notice: null,

    refreshSession: async () => {
      set({ sessionState: 'loading' });
      try {
        const { fetchMe } = await import('@/lib/api-client');
        const user = await fetchMe();
        if (!user) {
          set({ reviewer: null, sessionState: 'anonymous' });
          return;
        }
        const profile: ReviewerProfile = {
          id: user.id,
          name: user.name,
          specialty: user.specialty,
        };
        set({ reviewer: profile, sessionState: 'authed' });
      } catch {
        // A failing /api/auth/me means we cannot trust the session: demand login.
        set({ reviewer: null, sessionState: 'anonymous' });
      }
    },

    logout: async () => {
      try {
        const apiClient = await import('@/lib/api-client');
        await apiClient.logout();
      } catch {
        // Even if the API call fails, reset the client session state.
      }
      set({
        reviewer: null,
        sessionState: 'anonymous',
        cases: [],
        recordByImageId: {},
        syncByImageId: {},
        activeIndex: 0,
      });
    },

    hydrateDecisions: async () => {
      try {
        const { fetchValidationRecords } = await import('@/lib/api-client');
        const records = await fetchValidationRecords();
        if (records.length === 0) return;
        set((state) => {
          const recordByImageId = { ...state.recordByImageId };
          const syncByImageId = { ...state.syncByImageId };
          for (const record of records) {
            // A decision currently being saved locally wins over the snapshot.
            if (state.syncByImageId[record.imageId] === 'pending') continue;
            recordByImageId[record.imageId] = record;
            syncByImageId[record.imageId] = 'synced';
          }
          return { recordByImageId, syncByImageId };
        });
      } catch {
        // The session log is a convenience: stay usable if it is unavailable.
      }
    },

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
        // Images that still need a model label come first: they are the
        // outstanding work, and the main reason to open /predict.
        const cases = [...fetched].sort((a, b) => {
          if (Boolean(a.needsPrediction) !== Boolean(b.needsPrediction)) {
            return a.needsPrediction ? -1 : 1;
          }
          return a.patient.id < b.patient.id
            ? -1
            : a.patient.id > b.patient.id
              ? 1
              : 0;
        });
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
          set({ activeIndex: groups[activeGroupIdx - 1].startIndex });
        }
      }
    },

    approveActive: async () => {
      const state = get();
      const active = state.cases[state.activeIndex];
      if (!active) return;
      // Decisions are per breast: only the CC + MLO views of this side.
      const views = selectBreastViews(state);
      if (views.length === 0) return;
      if (views.some((c) => state.syncByImageId[c.imageId] === 'pending')) {
        return;
      }

      const fused = fuseBreastLabel(views);
      if (!fused) return;
      const records = buildBreastRecords(
        views,
        'APPROVED',
        `${fused.name} (${fused.range})`,
        '',
        get().reviewer?.id ?? ''
      );
      await commitDecision(records);
    },

    relabelActive: async (finalLabel, notes) => {
      const state = get();
      const active = state.cases[state.activeIndex];
      if (!active) return;
      const views = selectBreastViews(state);
      if (views.length === 0) return;
      if (views.some((c) => state.syncByImageId[c.imageId] === 'pending')) {
        return;
      }

      const records = buildBreastRecords(
        views,
        'RELABELED',
        finalLabel,
        notes,
        get().reviewer?.id ?? ''
      );
      await commitDecision(records);
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

/**
 * Views of the breast (same patient + laterality) containing the active image.
 * This is the unit review decisions are scoped to: approve / relabel apply to
 * every view of one breast, never to the whole patient (both sides).
 */
export function selectBreastViews(state: WorkbenchState): StudyCase[] {
  const active = state.cases[state.activeIndex];
  if (!active) return [];
  const pid = active.patient.id;
  const side = active.acquisition.laterality;
  return state.cases.filter(
    (c) => c.patient.id === pid && c.acquisition.laterality === side
  );
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
