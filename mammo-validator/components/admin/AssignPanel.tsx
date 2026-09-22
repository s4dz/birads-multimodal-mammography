'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react';
import { ClipboardList, Search } from 'lucide-react';
import {
  fetchAdminCases,
  fetchAdminUsers,
  fetchAssignmentWorkloads,
  postBulkAssignments,
} from '@/lib/api-client';
import { balanceGroups, groupByPatient } from '@/lib/assignment-balancer';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type {
  AdminCaseView,
  AppUser,
  BulkAssignmentAction,
  BulkAssignmentMode,
  RadiologistWorkload,
} from '@/lib/types';

type StatusFilter = 'all' | 'unassigned' | 'assigned' | 'in_review' | 'completed';

interface PatientGroup {
  patientId: string;
  items: AdminCaseView[];
}

function IndeterminateCheckbox({
  indeterminate,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="size-3.5 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500" {...rest} />;
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 10)}…` : id;
}

interface PreviewTarget {
  id: string;
  name: string;
  username: string;
  imageCount: number;
  groupCount: number;
}

export function AssignPanel() {
  const { t } = useTranslation();
  const [cases, setCases] = useState<AdminCaseView[] | null>(null);
  const [radiologists, setRadiologists] = useState<AppUser[]>([]);
  const [workloads, setWorkloads] = useState<RadiologistWorkload[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [aiFilter, setAiFilter] = useState('all');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewers, setReviewers] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<BulkAssignmentAction>('assign');
  const [mode, setMode] = useState<BulkAssignmentMode>('balanced');
  const [replaceExisting, setReplaceExisting] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [caseList, userList, workloadList] = await Promise.all([
        fetchAdminCases(),
        fetchAdminUsers(),
        fetchAssignmentWorkloads(),
      ]);
      setCases(caseList);
      setRadiologists(
        userList.filter((user) => user.role === 'radiologist' && user.active)
      );
      setWorkloads(workloadList);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showToast = useCallback((kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const groupsAll = useMemo<PatientGroup[]>(() => {
    const byPatient = new Map<string, AdminCaseView[]>();
    for (const item of cases ?? []) {
      const list = byPatient.get(item.patient.id) ?? [];
      list.push(item);
      byPatient.set(item.patient.id, list);
    }
    return Array.from(byPatient.entries())
      .map(([patientId, items]) => ({ patientId, items }))
      .sort((a, b) => a.patientId.localeCompare(b.patientId));
  }, [cases]);

  const aiClasses = useMemo(
    () =>
      Array.from(new Set((cases ?? []).map((item) => item.ai.predictedClass.name))).sort(),
    [cases]
  );

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesItem = (item: AdminCaseView): boolean => {
      if (statusFilter === 'unassigned' && item.assignedRadiologists.length > 0) return false;
      if (statusFilter === 'assigned' && item.assignedRadiologists.length === 0) return false;
      if (statusFilter === 'in_review' && (item.decisions === 0 || item.finalized)) return false;
      if (statusFilter === 'completed' && !item.finalized) return false;
      if (aiFilter !== 'all' && item.ai.predictedClass.name !== aiFilter) return false;
      return true;
    };
    return groupsAll.filter((group) => {
      const items = group.items.filter(matchesItem);
      if (items.length === 0) return false;
      if (query) {
        const haystack = `${group.patientId} ${items.map((item) => item.imageId).join(' ')}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [groupsAll, search, statusFilter, aiFilter]);

  const workloadById = useMemo(
    () => new Map(workloads.map((w) => [w.radiologistId, w])),
    [workloads]
  );

  const selectedCount = selected.size;
  const selectedGroupCount = useMemo(
    () => groupsAll.filter((g) => g.items.some((i) => selected.has(i.imageId))).length,
    [groupsAll, selected]
  );

  const partialGroups = useMemo(
    () =>
      groupsAll.filter((g) => {
        const picked = g.items.filter((i) => selected.has(i.imageId)).length;
        return picked > 0 && picked < g.items.length;
      }),
    [groupsAll, selected]
  );

  const decisionsAffected = useMemo(
    () =>
      selected.size === 0
        ? 0
        : (cases ?? []).filter(
            (item) => selected.has(item.imageId) && item.decisions > 0
          ).length,
    [cases, selected]
  );

  const toggleCase = (imageId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  };

  const toggleGroup = (group: PatientGroup, toSelect: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of group.items) {
        if (toSelect) next.add(item.imageId);
        else next.delete(item.imageId);
      }
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const group of filteredGroups) {
        for (const item of group.items) next.add(item.imageId);
      }
      return next;
    });
  };

  const deselectAll = () => setSelected(new Set());

  const toggleReviewer = (id: string) => {
    setReviewers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const preview = useMemo<{
    imageCount: number;
    groupCount: number;
    targets: PreviewTarget[];
  } | null>(() => {
    if (selected.size === 0 || reviewers.size === 0) return null;
    const refs = (cases ?? [])
      .filter((item) => selected.has(item.imageId))
      .map((item) => ({ imageId: item.imageId, patientId: item.patient.id }));
    const groups = groupByPatient(refs);
    const reviewerList = radiologists.filter((r) => reviewers.has(r.id));
    const nameOf = (id: string) => {
      const user = reviewerList.find((r) => r.id === id);
      return user ? { name: user.name, username: user.username } : { name: id, username: id };
    };
    if (action === 'unassign') {
      return {
        imageCount: refs.length,
        groupCount: groups.length,
        targets: reviewerList.map((r) => ({
          id: r.id,
          ...nameOf(r.id),
          imageCount: 0,
          groupCount: 0,
        })),
      };
    }
    if (mode === 'all') {
      return {
        imageCount: refs.length,
        groupCount: groups.length,
        targets: reviewerList.map((r) => ({
          id: r.id,
          ...nameOf(r.id),
          imageCount: refs.length,
          groupCount: groups.length,
        })),
      };
    }
    const split = balanceGroups(
      groups,
      reviewerList.map((r) => ({
        id: r.id,
        currentLoad: workloadById.get(r.id)?.assigned ?? 0,
      }))
    );
    return {
      imageCount: refs.length,
      groupCount: groups.length,
      targets: split.map((target) => ({
        id: target.radiologistId,
        ...nameOf(target.radiologistId),
        imageCount: target.patientGroups.reduce(
          (sum, g) => sum + g.imageIds.length,
          0
        ),
        groupCount: target.patientGroups.length,
      })),
    };
  }, [selected, reviewers, radiologists, cases, action, mode, workloadById]);

  const openPreview = () => {
    if (selected.size === 0) {
      showToast('error', t('admin.noSelection'));
      return;
    }
    if (reviewers.size === 0) {
      showToast('error', t('admin.noReviewers'));
      return;
    }
    setSubmitError(null);
    setPreviewOpen(true);
  };

  const confirmAssignment = async () => {
    if (!preview) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await postBulkAssignments({
        imageIds: Array.from(selected),
        radiologistIds: Array.from(reviewers),
        action,
        mode,
        replaceExisting,
      });
      setSelected(new Set());
      setPreviewOpen(false);
      showToast(
        'success',
        t('admin.assignmentSuccess', {
          cases: result.totalImages,
          reviewers: result.targets.length,
        })
      );
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const groupBadge = (items: AdminCaseView[]) => {
    if (items.some((item) => item.finalized)) return 'finalized';
    if (items.some((item) => item.decisions > 0)) return 'in_review';
    return 'not_started';
  };

  const badgeStyles: Record<string, string> = {
    finalized: 'bg-teal-500/10 text-teal-300 ring-teal-400/30',
    in_review: 'bg-amber-500/10 text-amber-300 ring-amber-400/30',
    not_started: 'bg-slate-500/10 text-slate-400 ring-slate-400/30',
  };
  const badgeLabels: Record<string, string> = {
    finalized: t('admin.finalized'),
    in_review: t('admin.statusInReview'),
    not_started: t('admin.notStarted'),
  };

  if (cases === null) {
    return <p className="p-8 text-center text-xs text-slate-500">{t('admin.loading')}</p>;
  }
  if (loadError) {
    return (
      <button type="button" onClick={() => void load()} className="p-8 text-xs text-rose-400 hover:underline">
        {t('admin.loadError')} — {t('admin.retry')}
      </button>
    );
  }

  const unassignedCount = cases.filter((c) => c.assignedRadiologists.length === 0).length;
  const inReviewCount = cases.filter((c) => !c.finalized && c.decisions > 0).length;
  const completedCount = cases.filter((c) => c.finalized).length;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5 font-semibold text-slate-200">
            <ClipboardList className="size-4 text-sky-400" />
            {t('admin.navAssign')}
          </span>
          <span>{unassignedCount} {t('admin.statusUnassigned')}</span>
          <span>{inReviewCount} {t('admin.statusInReview')}</span>
          <span>{completedCount} {t('admin.statusCompleted')}</span>
        </div>
        {toast ? (
          <span
            className={`rounded-md px-2 py-1 text-[11px] ${
              toast.kind === 'success'
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-rose-500/10 text-rose-300'
            }`}
          >
            {toast.text}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
        <div className="flex min-w-52 flex-1 items-center gap-2">
          <Search className="size-4 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('admin.searchHint')}
            className="w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          {t('admin.filterStatus')}
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="all">{t('admin.statusAll')}</option>
            <option value="unassigned">{t('admin.statusUnassigned')}</option>
            <option value="assigned">{t('admin.statusAssigned')}</option>
            <option value="in_review">{t('admin.statusInReview')}</option>
            <option value="completed">{t('admin.statusCompleted')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          {t('admin.filterAiClass')}
          <select
            value={aiFilter}
            onChange={(event) => setAiFilter(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="all">{t('admin.aiAll')}</option>
            {aiClasses.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Button variant="ghost" size="sm" onClick={toggleAllVisible}>
          {t('admin.selectAllVisible')}
        </Button>
        <Button variant="ghost" size="sm" onClick={deselectAll}>
          {t('admin.deselectAll')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-sky-300">
          {t('admin.selectedCases', { count: selectedCount })}
          <span className="ml-2 font-normal text-slate-500">
            {t('admin.selectedGroups', { count: selectedGroupCount })}
          </span>
        </span>
        <span className="text-slate-600">
          {t('admin.selectedGroups', { count: filteredGroups.length })} ·{' '}
          {t('admin.viewCount', { count: cases.length })}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2.5" />
                  <th className="px-3 py-2.5 font-semibold">{t('admin.case')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('admin.view')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('admin.assignedTo')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('admin.reviewStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-950/40">
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-600">
                      {t('admin.noReviews')}
                    </td>
                  </tr>
                ) : (
                  filteredGroups.map((group) => {
                    const picked = group.items.filter((i) => selected.has(i.imageId)).length;
                    const badge = groupBadge(group.items);
                    const assignedNames = radiologists
                      .filter((r) =>
                        group.items.some((i) => i.assignedRadiologists.includes(r.id))
                      )
                      .map((r) => r.username);
                    return (
                      <tr key={group.patientId} className="border-t border-slate-800/40 bg-slate-900/20">
                        <td className="px-3 py-2 align-middle">
                          <IndeterminateCheckbox
                            checked={picked === group.items.length}
                            indeterminate={picked > 0 && picked < group.items.length}
                            onChange={(event) => toggleGroup(group, event.target.checked)}
                            aria-label={group.patientId}
                          />
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <span className="font-mono text-slate-300">
                            {shortId(group.patientId)}
                          </span>
                          <span className="ml-2 text-[10px] text-slate-600">
                            {group.items[0]?.patient.sex} · {group.items[0]?.patient.ageAtStudy ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex flex-wrap gap-1">
                            {group.items.map((item) => {
                              const isPicked = selected.has(item.imageId);
                              return (
                                <label
                                  key={item.imageId}
                                  className={`inline-flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                                    isPicked
                                      ? 'border-sky-400/60 bg-sky-500/15 text-sky-200'
                                      : 'border-slate-700 text-slate-400 hover:border-slate-500'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={isPicked}
                                    onChange={() => toggleCase(item.imageId)}
                                  />
                                  {item.laterality}-{item.view}
                                </label>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle text-[11px] text-slate-400">
                          {assignedNames.length === 0 ? (
                            <span className="text-slate-600">{t('admin.notAssigned')}</span>
                          ) : (
                            assignedNames.join(', ')
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${badgeStyles[badge]}`}
                          >
                            {badgeLabels[badge]}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              {t('admin.reviewerWorkload')}
            </h3>
            {radiologists.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">{t('admin.noRadiologists')}</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1 font-semibold"> </th>
                    <th className="py-1 font-semibold">{t('admin.navUsers')}</th>
                    <th className="py-1 text-right font-semibold">{t('admin.assigned')}</th>
                    <th className="py-1 text-right font-semibold">{t('admin.columnCompleted')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {radiologists.map((radiologist) => {
                    const workload = workloadById.get(radiologist.id);
                    const isPicked = reviewers.has(radiologist.id);
                    return (
                      <tr
                        key={radiologist.id}
                        className={isPicked ? 'bg-sky-500/10' : undefined}
                      >
                        <td className="py-1.5 pl-1">
                          <input
                            type="checkbox"
                            checked={isPicked}
                            onChange={() => toggleReviewer(radiologist.id)}
                            className="size-3.5 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                          />
                        </td>
                        <td className="py-1.5">
                          <div className="text-slate-200">{radiologist.name}</div>
                          <div className="font-mono text-[10px] text-slate-500">{radiologist.username}</div>
                        </td>
                        <td className="py-1.5 text-right font-mono text-slate-300">
                          {workload?.assigned ?? 0}
                        </td>
                        <td className="py-1.5 text-right font-mono text-slate-300">
                          {workload?.completed ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              {t('admin.assign')}
            </h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setAction('assign')}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  action === 'assign'
                    ? 'border-sky-400/60 bg-sky-500/10 text-sky-200'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                <span className="font-semibold">{t('admin.assign')}</span>
              </button>
              <button
                type="button"
                onClick={() => setAction('unassign')}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  action === 'unassign'
                    ? 'border-rose-400/60 bg-rose-500/10 text-rose-200'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                <span className="font-semibold">{t('admin.unassignSelected')}</span>
              </button>
            </div>

            {action === 'assign' ? (
              <div className="mt-3 space-y-2">
                <div>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="assign-mode"
                      checked={mode === 'all'}
                      onChange={() => setMode('all')}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-xs text-slate-200">{t('admin.modeAssignAll')}</span>
                      <span className="block text-[10px] text-slate-500">{t('admin.assignAllHint')}</span>
                    </span>
                  </label>
                  <label className="mt-2 flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="assign-mode"
                      checked={mode === 'balanced'}
                      onChange={() => setMode('balanced')}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-xs text-slate-200">{t('admin.modeBalance')}</span>
                      <span className="block text-[10px] text-slate-500">{t('admin.balanceHint')}</span>
                    </span>
                  </label>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(event) => setReplaceExisting(event.target.checked)}
                    className="size-3.5 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                  />
                  <span>{t('admin.replaceExisting')}</span>
                </label>
                <p className="text-[10px] text-slate-600">{t('admin.replaceExistingHint')}</p>
              </div>
            ) : null}

            <div className="mt-4 flex gap-2">
              <Button
                variant={action === 'assign' ? 'primary' : 'danger'}
                className="flex-1"
                disabled={selectedCount === 0 || reviewers.size === 0}
                loading={submitting}
                onClick={() => void openPreview()}
              >
                {action === 'assign' ? t('admin.assignSelected') : t('admin.unassignSelected')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <ClipboardList className="size-4 text-sky-400" />
            {t('admin.previewTitle')}
          </span>
        }
        widthClassName="max-w-lg"
      >
        {preview ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              {t('admin.caseGroupCount', { groups: preview.groupCount, cases: preview.imageCount })}
            </p>
            <ul className="divide-y divide-slate-800/70 rounded-lg border border-slate-800">
              {preview.targets.map((target) => (
                <li key={target.id} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="min-w-0">
                    <span className="text-slate-200">{target.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-slate-500">{target.username}</span>
                  </span>
                  <span className="ml-3 shrink-0 font-mono text-slate-300">
                    {action === 'assign'
                      ? `${t('admin.selectedGroups', { count: target.groupCount })} · ${t('admin.selectedCases', { count: target.imageCount })}`
                      : t('admin.statusUnassigned').toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
            {action === 'assign' ? (
              <>
                {partialGroups.length > 0 ? (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                    {t('admin.warningPartialGroup')}
                  </p>
                ) : null}
                {replaceExisting && decisionsAffected > 0 ? (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                    {t('admin.warningExistingDecisions', { count: decisionsAffected })}
                  </p>
                ) : null}
              </>
            ) : null}
            {submitError ? (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
                {t('admin.assignmentFailed')}: {submitError}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPreviewOpen(false)}>
            {t('admin.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            onClick={() => void confirmAssignment()}
          >
            {t('admin.confirmAssignment')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}