import { useEffect, useRef } from 'react';
import { useApp } from '@/store/useApp';
import { useTodayTasks } from '@/hooks/useTasks';
import { useTriage } from '@/hooks/useMission';
import { useGroundLinkSimulator } from './ground/useGroundLink';
import { useDeviceEffects } from '@/devices/useDeviceEffects';
import { useCloudEffects } from '@/cloud/useCloudEffects';
import { alertSound } from '@/utils/sound';

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

  // On open / crew switch: tell the astronaut how they are (sound + toast), and nudge the check-in.
  useEffect(() => {
    if (!triage || nudged.current === triage.crewId) return;
    const crewId = triage.crewId;
    const t = setTimeout(() => {
      if (nudged.current === crewId) return;
      nudged.current = crewId;
      const top = triage.alerts[0];
      if (triage.overall === 'critical') {
        alertSound('critical');
        if ('Notification' in window && Notification.permission === 'granted') new Notification('VITALIS: get medical help now', { body: top?.title });
      } else if (triage.overall === 'act') alertSound('act');
      else if (triage.overall === 'nominal') alertSound('good');
      if (top && (top.level === 'critical' || top.level === 'act')) {
        toast({ title: top.title, body: top.why[0], level: top.level, action: { label: 'See what to do', route: `system/${top.systems[0]}` } });
      } else if (triage.overall === 'nominal') {
        toast({ title: 'All good today 💚', body: 'Everything looks normal for you.', level: 'nominal' });
      }
      const ci = tasks.find((x) => x.id === 'wake-vitals');
      if (ci && !ci.done) toast({ title: 'Morning check-in due', body: 'About 3 minutes. It keeps your "normal" up to date.', level: 'info', action: { label: 'Start', route: 'checkin' } });
    }, 1200);
    return () => clearTimeout(t);
  }, [triage, tasks, toast]);

  return null;
}
