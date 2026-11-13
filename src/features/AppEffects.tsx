import { useEffect, useRef } from 'react';
import { useApp } from '@/store/useApp';
import { useTodayTasks } from '@/hooks/useTasks';
import { useTriage } from '@/hooks/useMission';
import { useGroundLinkSimulator } from './ground/useGroundLink';
import { useDeviceEffects } from '@/devices/useDeviceEffects';
import { useCloudEffects } from '@/cloud/useCloudEffects';

/**
 * Background behaviours: smart schedule prompts, a one-time critical-alert nudge,
 * and the ground-link transmission simulator.
 */
export function AppEffects() {
  const { tasks } = useTodayTasks();
  const triage = useTriage();
  const toast = useApp((s) => s.toast);
  const enabled = useApp((s) => s.settings.notifications);
  const fired = useRef(new Set<string>());
  const nudged = useRef<string | null>(null);

  useGroundLinkSimulator(); // simulated delay only for local/demo packets (see hook)
  useDeviceEffects();
  useCloudEffects();

  // Mission Control lands on the Ground Console.
  const role = useApp((s) => (s.mission?.demo ? null : s.cloud.role));
  const routed = useRef(false);
  useEffect(() => {
    if (role !== 'ground' || routed.current) return;
    routed.current = true;
    const h = window.location.hash.replace(/^#\/?/, '');
    if (!h || h === 'dashboard') window.location.hash = '#/console';
  }, [role]);

  // Scheduled prompts: fire when a task's time arrives (checked every 30 s).
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      for (const t of tasks) {
        if (t.done || t.time !== hhmm || fired.current.has(t.id)) continue;
        fired.current.add(t.id);
        toast({ title: `⏰ ${t.title}`, body: t.detail, level: t.adaptive ? 'act' : 'info', action: t.route ? { label: 'Open', route: t.route } : undefined });
        if ('Notification' in window && Notification.permission === 'granted') new Notification(`VITALIS: ${t.title}`, { body: t.detail });
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [tasks, enabled, toast]);

  // On load / crew switch: nudge about the top alert and the pending check-in.
  useEffect(() => {
    if (!triage || nudged.current === triage.crewId) return;
    nudged.current = triage.crewId;
    const top = triage.alerts[0];
    const t = setTimeout(() => {
      if (top && (top.level === 'critical' || top.level === 'act')) {
        toast({ title: top.title, body: top.why[0], level: top.level, action: { label: 'See actions', route: `system/${top.systems[0]}` } });
      }
      const ci = tasks.find((x) => x.id === 'wake-vitals');
      if (ci && !ci.done) toast({ title: 'Morning check-in due', body: 'About 3 minutes. Your baseline depends on it.', level: 'info', action: { label: 'Start', route: 'checkin' } });
    }, 1200);
    return () => clearTimeout(t);
  }, [triage, tasks, toast]);

  return null;
}
