import { useMemo, useState } from 'react';
import { Check, EyeOff, LayoutDashboard, Stethoscope, UserRound } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { useAllTriage, useMissionContext } from '@/hooks/useMission';
import { navigate } from '@/hooks/useRoute';
import { INDICATORS } from '@/data/indicators';
import { LEVEL_META, rank } from '@/engine/status';
import { buildSeries } from '@/engine/series';
import type { IndicatorId } from '@/types';
import { formatValue } from '@/utils/units';
import { cn } from '@/utils';
import { AlertCard } from '@/components/AlertCard';
import { PageHeader, Panel, ProgressRing, Sparkline, StatusBadge, readinessColor } from '@/components/ui';

const MINI: IndicatorId[] = ['heartRate', 'systolic', 'sleepHours', 'mood'];

function useAcked() {
  const [acked, setAcked] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('vitalis.acked') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const toggle = (k: string) => {
    const n = acked.includes(k) ? acked.filter((x) => x !== k) : [...acked, k];
    setAcked(n);
    try {
      localStorage.setItem('vitalis.acked', JSON.stringify(n));
    } catch {
      /* ignore */
    }
  };
  return { acked, toggle };
}

export default function Crew() {
  const crew = useApp((s) => s.crew);
  const role = useApp((s) => s.role);
  const setRole = useApp((s) => s.setRole);
  const setActiveCrew = useApp((s) => s.setActiveCrew);
  const checkIns = useApp((s) => s.checkIns);
  const cognitive = useApp((s) => s.cognitive);
  const units = useApp((s) => s.settings.units);
  const { day } = useMissionContext();
  const all = useAllTriage();
  const { acked, toggle } = useAcked();

  const queue = useMemo(
    () =>
      all
        .flatMap((t) => t.alerts.map((a) => ({ a, crewId: t.crewId, key: `${t.crewId}:${a.id}:${t.day}` })))
        .filter((x) => rank(x.a.level) >= 1)
        .sort((x, y) => rank(y.a.level) - rank(x.a.level)),
    [all],
  );

  if (role !== 'cmo')
    return (
      <>
        <PageHeader eyebrow="Crew" title="Crew Medical Officer view" />
        <Panel className="max-w-xl text-center">
          <Stethoscope className="mx-auto mb-3 h-10 w-10 text-accent" aria-hidden />
          <p className="mb-4">This view shows every crew member's status and the alert queue. It's intended for the Crew Medical Officer.</p>
          <button className="btn-primary btn-lg" onClick={() => setRole('cmo')}>
            <Stethoscope className="h-5 w-5" aria-hidden /> Switch to CMO role
          </button>
        </Panel>
      </>
    );

  const counts = { critical: 0, act: 0, monitor: 0, nominal: 0 };
  all.forEach((t) => counts[t.overall]++);

  return (
    <>
      <PageHeader
        eyebrow={`CMO console · SOL ${day}`}
        title="Crew health at a glance"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <EyeOff className="h-4 w-4" aria-hidden /> Private journal notes are never shown to the CMO.
          </span>
        }
        actions={
          <button className="btn-ghost" onClick={() => setRole('astronaut')}>
            <UserRound className="h-4 w-4" aria-hidden /> Back to astronaut view
          </button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2" aria-label="Crew status summary">
        {(['critical', 'act', 'monitor', 'nominal'] as const).map((l) => (
          <span key={l} className={cn('chip text-sm', LEVEL_META[l].text, LEVEL_META[l].border)}>
            {LEVEL_META[l].emoji} {counts[l]} {LEVEL_META[l].label}
          </span>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-tour="crew-cards">
        {crew.map((c) => {
          const t = all.find((x) => x.crewId === c.id);
          if (!t) return null;
          const s = buildSeries(
            checkIns.filter((x) => x.crewId === c.id),
            cognitive.filter((x) => x.crewId === c.id),
          );
          const lastCheck = checkIns.filter((x) => x.crewId === c.id).at(-1);
          return (
            <Panel key={c.id} className={cn('flex flex-col gap-3 border-2', LEVEL_META[t.overall].border)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full font-display font-bold text-space-950" style={{ background: c.color }} aria-hidden>
                    {c.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                  <div>
                    <p className="font-display font-semibold">{c.callsign}</p>
                    <p className="muted text-xs">
                      {c.name} · {c.role}
                    </p>
                  </div>
                </div>
                <ProgressRing value={t.readiness} size={52} stroke={5} color={readinessColor(t.readiness)} label={`Readiness ${t.readiness}`}>
                  <span className="numeral text-sm">{t.readiness}</span>
                </ProgressRing>
              </div>
              <StatusBadge level={t.overall} />
              <p className="min-h-[40px] text-sm">{t.alerts[0]?.title ?? 'All systems nominal.'}</p>
              <ul className="grid grid-cols-2 gap-2">
                {MINI.map((id) => {
                  const ser = s[id] ?? [];
                  const lvl = t.indicators[id]?.level ?? 'nominal';
                  return (
                    <li key={id} className="rounded-lg bg-white/5 p-2">
                      <span className="muted flex items-center gap-1 text-[10px] uppercase tracking-wider">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_META[lvl].color }} aria-hidden />
                        {INDICATORS[id].short}
                      </span>
                      <span className="numeral text-base">{formatValue(id, ser.at(-1)?.value, units, false)}</span>
                      <Sparkline values={ser.slice(-14).map((p) => p.value)} width={90} height={18} color={LEVEL_META[lvl].color} label={`${INDICATORS[id].label} trend`} />
                    </li>
                  );
                })}
              </ul>
              <p className="muted text-xs">Last check-in: SOL {lastCheck?.day ?? '—'}</p>
              <button
                className="btn-ghost mt-auto"
                onClick={async () => {
                  await setActiveCrew(c.id);
                  navigate('dashboard');
                }}
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden /> Open {c.callsign}'s dashboard
              </button>
            </Panel>
          );
        })}
      </div>

      <h2 className="h2 mb-3 mt-8">Alert queue ({queue.filter((q) => !acked.includes(q.key)).length} open)</h2>
      <div className="space-y-2">
        {queue.map(({ a, crewId, key }) => {
          const c = crew.find((x) => x.id === crewId)!;
          const isAck = acked.includes(key);
          return (
            <div key={key} className={cn('flex flex-col gap-2 sm:flex-row sm:items-start', isAck && 'opacity-50')}>
              <div className="flex shrink-0 items-center gap-2 sm:w-40 sm:pt-3">
                <span className="h-3 w-3 rounded-full" style={{ background: c.color }} aria-hidden />
                <span className="font-semibold">{c.callsign}</span>
              </div>
              <div className="min-w-0 flex-1">
                <AlertCard alert={a} />
              </div>
              <button className={cn('btn-ghost shrink-0', isAck && 'text-nominal')} onClick={() => toggle(key)} aria-pressed={isAck}>
                <Check className="h-4 w-4" aria-hidden /> {isAck ? 'Acknowledged' : 'Acknowledge'}
              </button>
            </div>
          );
        })}
        {!queue.length && <p className="muted">No open alerts across the crew.</p>}
      </div>
    </>
  );
}
