/**
 * Patient-group aware assignment logic.
 *
 * Pure, framework-agnostic TypeScript shared by the server (bulk assignment
 * route) and the client (live preview in the Assignment Manager) so the two
 * sides can never disagree about how a batch is split.
 *
 * The assignment unit is the patient: every image of one patient is treated as
 * a single group, so automatic balancing never splits the views (L-CC, L-MLO,
 * R-CC, R-MLO) of one patient across different reviewers.
 */

export interface CasePatientRef {
  imageId: string;
  patientId: string;
}

export interface PatientGroup {
  patientId: string;
  imageIds: string[];
}

/** Collapse case refs into patient groups, ordered deterministically. */
export function groupByPatient(refs: CasePatientRef[]): PatientGroup[] {
  const byPatient = new Map<string, string[]>();
  for (const ref of refs) {
    const list = byPatient.get(ref.patientId) ?? [];
    list.push(ref.imageId);
    byPatient.set(ref.patientId, list);
  }
  return Array.from(byPatient.entries())
    .map(([patientId, imageIds]) => ({ patientId, imageIds }))
    .sort((a, b) => a.patientId.localeCompare(b.patientId));
}

export interface BalanceParticipant {
  id: string;
  /** Current total assignment count (images) — "existing workload". */
  currentLoad: number;
}

export interface BalanceTarget {
  radiologistId: string;
  patientGroups: PatientGroup[];
}

/**
 * Greedy, deterministic load balance across participants.
 *
 * Groups are handed out one at a time to the currently least-loaded
 * participant (ties broken by id), so the resulting workload tracks the
 * existing counts — no optimisation, just a stable round-robin against load.
 */
export function balanceGroups(
  groups: PatientGroup[],
  participants: BalanceParticipant[]
): BalanceTarget[] {
  if (participants.length === 0) return [];
  const loads = participants.map((participant) => ({
    id: participant.id,
    load: participant.currentLoad,
  }));
  const ordered = [...groups].sort(
    (a, b) =>
      b.imageIds.length - a.imageIds.length ||
      a.patientId.localeCompare(b.patientId)
  );
  const plan = new Map<string, PatientGroup[]>(
    participants.map((participant) => [participant.id, []])
  );
  for (const group of ordered) {
    const best = loads.reduce((acc, candidate) =>
      candidate.load < acc.load ||
      (candidate.load === acc.load && candidate.id < acc.id)
        ? candidate
        : acc
    );
    const assignedGroups = plan.get(best.id) ?? [];
    assignedGroups.push(group);
    plan.set(best.id, assignedGroups);
    best.load += group.imageIds.length;
  }
  return participants.map((participant) => ({
    radiologistId: participant.id,
    patientGroups: plan.get(participant.id) ?? [],
  }));
}