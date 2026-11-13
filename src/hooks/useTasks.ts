import { useCallback, useMemo, useState } from 'react';
import { buildSchedule, type ScheduledTask } from '@/engine/schedule';
import { useApp } from '@/store/useApp';
import { useMissionContext, useTriage } from './useMission';

const key = (crew: string, day: number) => `vitalis.tasks.${crew}.${day}`;

function readDone(k: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export interface TaskWithState extends ScheduledTask {
  done: boolean;
  auto: boolean;
}

/** Today's schedule with completion state (auto-detected from data, or ticked manually). */
export function useTodayTasks() {
  const { day, crewMember } = useMissionContext();
  const triage = useTriage();
  const checkIns = useApp((s) => s.checkIns);
  const cognitive = useApp((s) => s.cognitive);
  const journal = useApp((s) => s.journal);
  const crewId = crewMember?.id ?? '';
  const k = key(crewId, day);
  const [manual, setManual] = useState<string[]>(() => readDone(k));

  const tasks: TaskWithState[] = useMemo(() => {
    const today = checkIns.filter((c) => c.crewId === crewId && c.day === day);
    const autoDone = new Set<string>();
    if (today.length) autoDone.add('wake-vitals');
    if (today.some((c) => c.values.bodyMass !== undefined)) autoDone.add('mass');
    if (cognitive.some((c) => c.crewId === crewId && c.day === day)) autoDone.add('pvt');
    if (journal.some((j) => j.crewId === crewId && j.day === day)) autoDone.add('evening-mood');
    if (today.filter((c) => c.values.systolic !== undefined).length >= 2) autoDone.add('bp-evening');
    return buildSchedule(day, triage).map((t) => ({ ...t, auto: autoDone.has(t.id), done: autoDone.has(t.id) || manual.includes(t.id) }));
  }, [checkIns, cognitive, journal, crewId, day, triage, manual]);

  const toggle = useCallback(
    (id: string) => {
      const next = manual.includes(id) ? manual.filter((x) => x !== id) : [...manual, id];
      setManual(next);
      try {
        localStorage.setItem(k, JSON.stringify(next));
      } catch {
        /* storage unavailable: keep in memory */
      }
    },
    [manual, k],
  );

  return { tasks, toggle, day };
}
