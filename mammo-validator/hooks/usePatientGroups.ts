'use client';

import { useMemo } from 'react';
import type { PatientGroup } from '@/store/workbench-store';
import type { StudyCase } from '@/lib/types';

export type { PatientGroup };

export function usePatientGroups(cases: StudyCase[]): PatientGroup[] {
  return useMemo(() => {
    const groups: PatientGroup[] = [];
    let current: PatientGroup | null = null;

    cases.forEach((c, i) => {
      const pid = c.patient.id;
      if (!current || current.patientId !== pid) {
        if (current) groups.push(current);
        current = {
          patientId: pid,
          patient: c.patient,
          study: c.study,
          cases: [],
          startIndex: i,
          endIndex: i,
        };
      }
      current.cases.push(c);
      current.endIndex = i;
    });

    if (current) groups.push(current);
    return groups;
  }, [cases]);
}

export function useActivePatientGroup(
  cases: StudyCase[],
  activeIndex: number,
): PatientGroup | undefined {
  const groups = usePatientGroups(cases);
  return useMemo(
    () => groups.find((g) => activeIndex >= g.startIndex && activeIndex <= g.endIndex),
    [groups, activeIndex],
  );
}
