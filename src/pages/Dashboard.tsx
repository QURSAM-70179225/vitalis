import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronRight, Circle, ClipboardCheck, Radio, ShieldAlert, Sparkles } from 'lucide-react';
import type { IndicatorId, SystemId } from '@/types';
import { useApp } from '@/store/useApp';
import { useCrewData, useMissionContext, useTriage } from '@/hooks/useMission';
import { useTodayTasks } from '@/hooks/useTasks';
import { navigate } from '@/hooks/useRoute';
import { SYSTEMS, SYSTEM_IDS } from '@/data/systems';
import { HAZARD_LIST } from '@/data/hazards';
import { INDICATORS } from '@/data/indicators';
import { LEVEL_META, maxLevel, rank } from '@/engine/status';
import { buildSeries } from '@/engine/series';
import { roughDuration } from '@/engine/escalation';
import { formatDelay } from '@/data/environments';
import { formatValue } from '@/utils/units';
import { cn } from '@/utils';
import { BodyMap } from '@/features/bodymap/BodyMap';
import { SystemPanel } from '@/features/bodymap/SystemPanel';
import { AlertCard } from '@/components/AlertCard';
import { Disclaimer, Drawer, HazardIcon, Panel, ProgressRing, Sparkline, StatusBadge, readinessColor } from '@/components/ui';

const TILES: IndicatorId[] = ['heartRate', 'systolic', 'spo2', 'temperature', 'sleepHours', 'mood', 'radiationDose', 'bodyMass'];

export function Dashboard() {
  const { crewMember, day, env, delaySec } = useMissionContext();
  const triage = useTriage();
  const { checkIns, cognitive } = useCrewData();
  const units = useApp((s) => s.settings.units);
  const setCalm = useApp((s) => s.setCalm);
  const { tasks, toggle } = useTodayTasks();
  const [selected, setSelected] = useState<SystemId | null>(null);

  if (!triage || !crewMember) return null;
  const series = buildSeries(checkIns, cognitive);
  const levels = Object.fromEntries(SYSTEM_IDS.map((s) => [s, triage.systems[s].level])) as Record<SystemId, (typeof triage.systems)[SystemId]['level']>;
  const doneToday = checkIns.some((c) => c.day === day);
  const hr = series.heartRate?.[series.heartRate.length - 1]?.value ?? 60;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">
            SOL {day} · {env.name} · {crewMember.role}
          </p>
          <h1 className="h1">
            {greet}, {crewMember.callsign}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {triage.overall === 'critical' && (
            <button className="btn-danger" onClick={() => setCalm(true)}>
              <ShieldAlert className="h-5 w-5" aria-hidden /> Calm mode checklist
            </button>
          )}
          <button className={cn(doneToday ? 'btn-ghost' : 'btn-primary', 'btn-lg')} onClick={() => navigate('checkin')} data-tour="checkin-cta">
            <ClipboardCheck className="h-5 w-5" aria-hidden /> {doneToday ? 'New check-in' : 'Start daily check-in'}
          </button>
        </div>
      </header>

      {/* Core insight: comm delay */}
      {delaySec >= 30 && (
        <motion.div data-tour="delay" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="panel mb-5 flex flex-wrap items-center gap-3 border-accent/30 px-4 py-3">
          <Radio className="h-5 w-5 shrink-0 text-accent" aria-hidden />
          <p className="flex-1 text-sm">
            <span className="font-semibold">Earth is {formatDelay(delaySec)} away (one-way).</span> A question to your flight surgeon takes at least{' '}
            {roughDuration(delaySec * 2)} round-trip. VITALIS gives you <span className="text-accent">status → explanation → action → escalation</span> right now, fully offline.
          </p>
        </motion.div>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Body map */}
        <Panel className="lg:col-span-7" aria-labelledby="bm-h" data-tour="bodymap">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="bm-h" className="h2">
              Body systems
            </h2>
            <StatusBadge level={triage.overall} />
          </div>
          <div className="grid items-start gap-4 sm:grid-cols-[1fr_220px]">
            <BodyMap levels={levels} heartRate={hr} selected={selected} onSelect={setSelected} emphasized={env.emphasizedSystems} />
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-1" aria-label="Body systems list">
              {SYSTEM_IDS.slice()
                .sort((a, b) => rank(levels[b]) - rank(levels[a]))
                .map((s) => {
                  const m = LEVEL_META[levels[s]];
                  return (
                    <li key={s}>
                      <button
                        onClick={() => setSelected(s)}
                        className={cn('focus-ring flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-sm transition hover:bg-white/5', selected === s ? 'border-accent' : 'border-white/5')}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{SYSTEMS[s].short}</span>
                        <span className={cn('text-[11px] font-semibold', m.text)}>{m.short}</span>
                        {env.emphasizedSystems.includes(s) && <Sparkles className="h-3.5 w-3.5 text-accent" aria-label="Emphasized for this mission" />}
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        </Panel>

        {/* Readiness + alerts */}
        <div className="flex flex-col gap-5 lg:col-span-5">
          <Panel className="flex items-center gap-5" data-tour="readiness">
            <ProgressRing value={triage.readiness} color={readinessColor(triage.readiness)} label={`Mission readiness ${triage.readiness} of 100`}>
              <div>
                <p className="numeral text-4xl">{triage.readiness}</p>
                <p className="muted text-[10px] uppercase tracking-widest">Readiness</p>
              </div>
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Overall status</p>
              <StatusBadge level={triage.overall} size="lg" className="mt-1" />
              <p className="muted mt-2 text-sm">{LEVEL_META[triage.overall].description}</p>
              <p className="mt-2 text-xs text-slate-400">
                {triage.alerts.length} active alert{triage.alerts.length === 1 ? '' : 's'} · last data SOL {triage.day}
              </p>
            </div>
          </Panel>

          <Panel aria-labelledby="al-h" data-tour="alerts">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="al-h" className="h2">
                Active alerts
              </h2>
              <span className="muted text-xs">Tap for why → actions</span>
            </div>
            {triage.alerts.length ? (
              <div className="space-y-2">
                {triage.alerts.slice(0, 4).map((a, i) => (
                  <AlertCard key={a.id} alert={a} defaultOpen={i === 0 && a.level === 'critical'} />
                ))}
                {triage.alerts.length > 4 && <p className="muted text-xs">+{triage.alerts.length - 4} more in body systems</p>}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-nominal">
                <CheckCircle2 className="h-5 w-5" aria-hidden /> No alerts. All systems nominal.
              </p>
            )}
          </Panel>
        </div>

        {/* Hazard exposure strip */}
        <Panel className="lg:col-span-12" aria-labelledby="hz-h">
          <h2 id="hz-h" className="eyebrow mb-3">
            NASA HRP hazard status
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {HAZARD_LIST.map((h) => {
              const lvl = maxLevel(...triage.alerts.filter((a) => a.hazards.includes(h.id)).map((a) => a.level));
              const n = triage.alerts.filter((a) => a.hazards.includes(h.id)).length;
              return (
                <li key={h.id} className={cn('flex items-center gap-3 rounded-xl border bg-white/5 p-3', env.emphasizedHazards.includes(h.id) ? 'border-accent/30' : 'border-white/5')}>
                  <HazardIcon id={h.id} className="h-6 w-6 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{h.name}</p>
                    <p className={cn('text-xs font-semibold', LEVEL_META[lvl].text)}>
                      {LEVEL_META[lvl].label}
                      {n ? ` · ${n} alert${n > 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Vitals tiles */}
        <section className="lg:col-span-8" aria-labelledby="vt-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="vt-h" className="h2">
              Latest readings
            </h2>
            <a href="#/trends" className="text-sm font-semibold text-accent hover:underline">
              All trends →
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TILES.map((id) => {
              const s = series[id] ?? [];
              const last = s[s.length - 1];
              const a = triage.indicators[id];
              const lvl = a?.level ?? 'nominal';
              const m = LEVEL_META[lvl];
              return (
                <a key={id} href={`#/trends/${id}`} className="panel focus-ring block p-3 transition hover:border-white/30">
                  <div className="flex items-center justify-between">
                    <span className="eyebrow">{INDICATORS[id].short}</span>
                    <span className={cn('flex items-center gap-1 text-[11px] font-semibold', m.text)}>
                      <span className="h-2 w-2 rounded-full" style={{ background: m.color }} aria-hidden />
                      {m.short}
                    </span>
                  </div>
                  <p className="numeral mt-1 text-3xl">
                    {id === 'systolic' && last
                      ? `${last.value}/${series.diastolic?.[series.diastolic.length - 1]?.value ?? '—'}`
                      : formatValue(id, last?.value, units, false)}
                    <span className="muted ml-1 text-xs font-normal">{id === 'systolic' ? 'mmHg' : formatValue(id, 0, units).split(' ').slice(1).join(' ')}</span>
                  </p>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    <span className="muted text-[11px]">
                      {a?.pctFromBaseline !== null && a?.pctFromBaseline !== undefined
                        ? `${a.pctFromBaseline >= 0 ? '+' : ''}${a.pctFromBaseline.toFixed(0)}% vs you`
                        : last
                          ? `SOL ${last.day}`
                          : 'no data'}
                    </span>
                    <Sparkline values={s.slice(-14).map((p) => p.value)} color={m.color} width={70} height={24} label={`${INDICATORS[id].label} 14-day trend`} />
                  </div>
                </a>
              );
            })}
          </div>
        </section>

        {/* Today's tasks */}
        <Panel className="lg:col-span-4" aria-labelledby="td-h" data-tour="tasks">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="td-h" className="h2">
              Today
            </h2>
            <span className="muted text-xs">
              {doneCount}/{tasks.length} done
            </span>
          </div>
          <ul className="space-y-1">
            {tasks.slice(0, 7).map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <button
                  onClick={() => !t.auto && toggle(t.id)}
                  aria-pressed={t.done}
                  aria-label={`${t.title}${t.done ? ', done' : ''}`}
                  className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-white/5"
                >
                  {t.done ? <CheckCircle2 className="h-5 w-5 text-nominal" aria-hidden /> : <Circle className="h-5 w-5 text-slate-500" aria-hidden />}
                </button>
                <button
                  className="focus-ring min-w-0 flex-1 rounded-lg py-1 text-left"
                  onClick={() => t.route && navigate(t.route)}
                  disabled={!t.route}
                >
                  <span className={cn('block truncate text-sm', t.done && 'text-slate-500 line-through')}>
                    {t.adaptive && <span className="mr-1 rounded bg-act/20 px-1 text-[10px] font-bold text-act">ADAPTIVE</span>}
                    {t.title}
                  </span>
                  <span className="muted block text-xs">{t.time}</span>
                </button>
                {t.route && <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />}
              </li>
            ))}
          </ul>
          <a href="#/schedule" className="mt-2 block text-sm font-semibold text-accent hover:underline">
            Full schedule →
          </a>
        </Panel>
      </div>

      <Disclaimer className="mt-6" />

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected ? SYSTEMS[selected].name : ''}>
        {selected && <SystemPanel id={selected} triage={triage} />}
      </Drawer>
    </>
  );
}
