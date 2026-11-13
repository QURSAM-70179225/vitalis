import { BellRing, CalendarDays, CheckCircle2, Circle, Zap } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { useTodayTasks } from '@/hooks/useTasks';
import { useMissionContext } from '@/hooks/useMission';
import { navigate } from '@/hooks/useRoute';
import { cn } from '@/utils';
import { PageHeader, Panel } from '@/components/ui';

const KIND_COLOR: Record<string, string> = {
  vitals: '#22d3ee',
  exercise: '#34d399',
  mood: '#a78bfa',
  mass: '#facc15',
  exam: '#f472b6',
  cognitive: '#60a5fa',
  adaptive: '#fb923c',
  meal: '#94a3b8',
  sleep: '#818cf8',
};

export default function Schedule() {
  const { tasks, toggle, day } = useTodayTasks();
  const { env } = useMissionContext();
  const toast = useApp((s) => s.toast);
  const notifications = useApp((s) => s.settings.notifications);
  const updateSettings = useApp((s) => s.updateSettings);
  const adaptive = tasks.filter((t) => t.adaptive);
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const next = tasks.find((t) => !t.done && t.time >= nowStr) ?? tasks.find((t) => !t.done);

  const upcoming = [
    { label: 'Weekly body mass (SLAMMD)', inDays: (7 - (day % 7)) % 7 || 7 },
    { label: 'Monthly in-depth exam: OCT, ultrasound, blood draw', inDays: (30 - (day % 30)) % 30 || 30 },
    { label: 'Reaction time test', inDays: (3 - (day % 3)) % 3 || 3 },
  ];

  return (
    <>
      <PageHeader
        eyebrow={`SOL ${day} · ${env.short}`}
        title="Mission routine"
        subtitle="Your daily timeline. VITALIS adds extra checks automatically while a risk is elevated, and removes them when it clears."
        actions={
          <>
            <button
              className="btn-ghost"
              onClick={() => next && toast({ title: `⏰ ${next.title}`, body: `${next.time} · ${next.detail}`, level: next.adaptive ? 'act' : 'info', action: next.route ? { label: 'Open', route: next.route } : undefined })}
            >
              <BellRing className="h-4 w-4" aria-hidden /> Preview next prompt
            </button>
            <label className="btn-ghost cursor-pointer">
              <input type="checkbox" className="h-5 w-5 accent-cyan-400" checked={notifications} onChange={(e) => updateSettings({ notifications: e.target.checked })} />
              Smart prompts
            </label>
          </>
        }
      />
      {adaptive.length > 0 && (
        <Panel className="mb-5 border-act/40">
          <h2 className="h2 mb-2 flex items-center gap-2">
            <Zap className="h-5 w-5 text-act" aria-hidden /> Adapted to your current risks
          </h2>
          <ul className="space-y-1 text-sm">
            {adaptive.map((t) => (
              <li key={t.id}>
                <span className="font-semibold">{t.title}</span> <span className="muted">because {t.reason?.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Panel aria-labelledby="tl-h">
          <h2 id="tl-h" className="h2 mb-4">
            Today
          </h2>
          <ol className="relative space-y-2 border-l border-white/10 pl-6">
            {tasks.map((t) => (
              <li key={t.id} className="relative">
                <span className="absolute -left-[31px] top-4 h-3 w-3 rounded-full ring-4 ring-space-950" style={{ background: KIND_COLOR[t.kind] }} aria-hidden />
                <div className={cn('flex items-center gap-3 rounded-xl border p-3', t.adaptive ? 'border-act/40 bg-act/5' : 'border-white/5 bg-white/[0.03]', t.time <= nowStr && !t.done && 'ring-1 ring-monitor/40')}>
                  <span className="numeral w-14 shrink-0 text-sm text-slate-300">{t.time}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-semibold', t.done && 'text-slate-500 line-through')}>
                      {t.adaptive && <span className="mr-1.5 rounded bg-act/20 px-1.5 py-0.5 text-[10px] font-bold text-act">ADAPTIVE</span>}
                      {t.title}
                    </p>
                    <p className="muted text-xs">
                      {t.detail} · {t.minutes} min{t.auto && t.done ? ' · auto-detected from your data' : ''}
                    </p>
                  </div>
                  {t.route && !t.done && (
                    <button className="btn-ghost hidden sm:inline-flex" onClick={() => navigate(t.route!)}>
                      Start
                    </button>
                  )}
                  <button onClick={() => !t.auto && toggle(t.id)} aria-pressed={t.done} aria-label={`Mark ${t.title} ${t.done ? 'not done' : 'done'}`} className="focus-ring grid h-11 w-11 place-items-center rounded-lg hover:bg-white/5">
                    {t.done ? <CheckCircle2 className="h-6 w-6 text-nominal" aria-hidden /> : <Circle className="h-6 w-6 text-slate-500" aria-hidden />}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel aria-labelledby="up-h">
          <h2 id="up-h" className="h2 mb-3 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-accent" aria-hidden /> Coming up
          </h2>
          <ul className="space-y-2">
            {upcoming.map((u) => (
              <li key={u.label} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
                <span>{u.label}</span>
                <span className="chip">SOL {day + u.inDays}</span>
              </li>
            ))}
          </ul>
          <p className="muted mt-4 text-xs">Times use the mission clock. Prompts appear as on-screen notifications at the scheduled time while VITALIS is open.</p>
        </Panel>
      </div>
    </>
  );
}
