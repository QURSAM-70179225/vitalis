import { useMemo } from 'react';
import { useApp } from '@/store/useApp';
import { ENVIRONMENTS, commDelaySeconds } from '@/data/environments';
import { evaluate } from '@/engine/triage';
import { resolveThresholds } from '@/engine/thresholds';
import { missionDay } from '@/utils';
import type { CrewMember, MissionEnvironment, TriageResult } from '@/types';

export interface MissionContext {
  env: MissionEnvironment;
  day: number;
  delaySec: number;
  crewMember: CrewMember | null;
}

export function useMissionContext(): MissionContext {
  const mission = useApp((s) => s.mission);
  const crew = useApp((s) => s.crew);
  return useMemo(() => {
    const env = ENVIRONMENTS[mission?.environmentId ?? 'iss'];
    const day = mission ? missionDay(mission.startDate) : 1;
    return {
      env,
      day,
      delaySec: commDelaySeconds(env.id, day),
      crewMember: crew.find((c) => c.id === mission?.activeCrewId) ?? crew[0] ?? null,
    };
  }, [mission, crew]);
}

export function useThresholds() {
  const overrides = useApp((s) => s.settings.thresholdOverrides);
  return useMemo(() => resolveThresholds(overrides), [overrides]);
}

/** Triage for one crew member (defaults to the active one). */
export function useTriage(crewId?: string): TriageResult | null {
  const { env, crewMember } = useMissionContext();
  const checkIns = useApp((s) => s.checkIns);
  const cognitive = useApp((s) => s.cognitive);
  const thresholds = useThresholds();
  const id = crewId ?? crewMember?.id;
  return useMemo(() => {
    if (!id) return null;
    return evaluate({ crewId: id, checkIns, cognitive, environment: env, thresholds });
  }, [id, checkIns, cognitive, env, thresholds]);
}

export function useAllTriage(): TriageResult[] {
  const { env } = useMissionContext();
  const crew = useApp((s) => s.crew);
  const checkIns = useApp((s) => s.checkIns);
  const cognitive = useApp((s) => s.cognitive);
  const thresholds = useThresholds();
  return useMemo(
    () => crew.map((c) => evaluate({ crewId: c.id, checkIns, cognitive, environment: env, thresholds })),
    [crew, checkIns, cognitive, env, thresholds],
  );
}

export function useCrewData(crewId?: string) {
  const { crewMember } = useMissionContext();
  const id = crewId ?? crewMember?.id;
  const checkIns = useApp((s) => s.checkIns);
  const cognitive = useApp((s) => s.cognitive);
  const journal = useApp((s) => s.journal);
  return useMemo(
    () => ({
      checkIns: checkIns.filter((c) => c.crewId === id),
      cognitive: cognitive.filter((c) => c.crewId === id),
      journal: journal.filter((c) => c.crewId === id),
    }),
    [checkIns, cognitive, journal, id],
  );
}
