import { useEffect, useRef } from 'react';
import { useApp } from '@/store/useApp';
import { useTriage } from '@/hooks/useMission';
import type { SharedAlert } from '@/types';

/**
 * Shares the signed-in astronaut's own triage alerts with the ground team so the
 * console gets a realtime notification (the console also recomputes triage itself).
 */
export function useCloudEffects() {
  const userId = useApp((s) => s.cloud.userId);
  const role = useApp((s) => s.cloud.role);
  const demo = useApp((s) => s.mission?.demo);
  const triage = useTriage(userId && role !== 'ground' ? userId : undefined);
  const lastSig = useRef('');

  useEffect(() => {
    if (!userId || demo || role === 'ground' || !triage || triage.crewId !== userId) return;
    const shared: SharedAlert[] = triage.alerts
      .filter((a) => a.level !== 'nominal')
      .map((a) => ({
        id: `${userId}:${a.id}:${triage.day}`,
        crewId: userId,
        day: triage.day,
        level: a.level,
        ruleId: a.ruleId,
        title: a.title,
        why: a.why,
        actions: a.actions,
        source: 'triage',
        createdAt: new Date().toISOString(),
      }));
    const sig = shared.map((a) => `${a.id}|${a.level}|${a.why.join(';')}`).join('\n');
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    const existing = new Map(useApp.getState().sharedAlerts.map((a) => [a.id, a]));
    const changed = shared
      .filter((a) => {
        const e = existing.get(a.id);
        return !e || e.level !== a.level || e.why.join(';') !== a.why.join(';');
      })
      .map((a) => ({ ...a, createdAt: existing.get(a.id)?.createdAt ?? a.createdAt }));
    if (changed.length) void useApp.getState().upsertSharedAlerts(changed);
  }, [triage, userId, role, demo]);
}
