import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Eye, Pause, Play, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import type { IndicatorId, SystemId } from '@/types';
import { INDICATORS } from '@/data/indicators';
import { formatValue } from '@/utils/units';
import { navigate } from '@/hooks/useRoute';
import { useApp } from '@/store/useApp';
import { useCrewData, useMissionContext, useThresholds } from '@/hooks/useMission';
import { SYSTEMS, SYSTEM_IDS } from '@/data/systems';
import { LEVEL_META } from '@/engine/status';
import { bodyChanges, healthJourney, type BodyChange } from '@/engine/journey';
import { buildSeries } from '@/engine/series';
import { BodyMap } from '@/features/bodymap/BodyMap';
import { EVENT_STYLE } from '@/features/trends/IndicatorChart';
import { cn } from '@/utils';
import { PageHeader, Panel, StatusBadge } from '@/components/ui';

const RANGES = [30, 40, 60, 90] as const;
/** Readings shown under the body while the replay plays. */
const REPLAY_READINGS: IndicatorId[] = ['heartRate', 'systolic', 'spo2', 'sleepHours', 'mood', 'radiationDose'];

const VERDICT = {
  good: { Icon: CheckCircle2, cls: 'border-nominal/40 bg-nominal/5', color: '#34d399', label: 'Looking good' },
  watch: { Icon: Eye, cls: 'border-monitor/40 bg-monitor/5', color: '#facc15', label: 'Keep an eye on it' },
  concern: { Icon: TriangleAlert, cls: 'border-act/50 bg-act/10', color: '#fb923c', label: 'Needs attention' },
} as const;

function ChangeCard({ c }: { c: BodyChange }) {
  const v = VERDICT[c.verdict];
  const Trend = c.pct >= 0 ? TrendingUp : TrendingDown;
  const digits = c.unit === 'kg' || c.unit === 'h' || c.unit === '/5' ? 1 : 0;
  return (
    <li className={cn('rounded-2xl border p-4', v.cls)}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{c.headline}</p>
        <v.Icon className="h-5 w-5 shrink-0" style={{ color: v.color }} aria-label={v.label} />
      </div>
      {c.indicator !== 'radiationTotal' && (
        <p className="numeral mt-1 flex items-center gap-2 text-lg">
          {c.start.toFixed(digits)} <Trend className="h-4 w-4 text-slate-400" aria-hidden /> {c.end.toFixed(digits)}
          <span className="muted text-xs font-normal">{c.unit}</span>
        </p>
      )}
      <p className="muted mt-1 text-sm">{c.why}</p>
    </li>
  );
}

export default function Journey() {
  const { env, day, crewMember } = useMissionContext();
  const { checkIns, cognitive } = useCrewData();
  const events = useApp((s) => s.events);
  const thresholds = useThresholds();
  const [range, setRange] = useState<(typeof RANGES)[number]>(40);
  const from = Math.max(1, day - range + 1);
  const [selected, setSelected] = useState(day);
  const [playing, setPlaying] = useState(false);

  const journey = useMemo(
    () => (crewMember ? healthJourney({ crewId: crewMember.id, checkIns, cognitive, environment: env, thresholds }, from, day) : []),
    [crewMember, checkIns, cognitive, env, thresholds, from, day],
  );
  const changes = useMemo(() => (crewMember ? bodyChanges({ crewId: crewMember.id, checkIns, cognitive }, from, day) : []), [crewMember, checkIns, cognitive, from, day]);
  const hr = useMemo(() => buildSeries(checkIns, cognitive).heartRate ?? [], [checkIns, cognitive]);

  useEffect(() => setSelected(day), [day, range]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setSelected((d) => {
        if (d >= day) {
          setPlaying(false);
          return day;
        }
        return d + 1;
      });
    }, 220);
    return () => clearInterval(t);
  }, [playing, day]);

  const sel = journey.find((d) => d.day === selected);
  const withData = journey.filter((d) => d.hasData);
  const count = (l: string) => withData.filter((d) => d.overall === l).length;
  const evs = events.filter((e) => e.day >= from && e.day <= day && (e.crewIds.length === 0 || e.crewIds.includes(crewMember?.id ?? '')));
  const selEvent = evs.find((e) => e.day === selected);
  const levels = sel ? sel.systems : (Object.fromEntries(SYSTEM_IDS.map((s) => [s, 'nominal'])) as Record<SystemId, 'nominal'>);
  const hrOnDay = hr.filter((p) => p.day <= selected).at(-1)?.value ?? 60;
  const units = useApp((s) => s.settings.units);
  const dayCheckIn = checkIns.filter((c) => c.crewId === crewMember?.id && c.day === selected).at(-1);
  const enoughDays = withData.length >= 2 && day > from;

  return (
    <>
      <PageHeader
        eyebrow={`${crewMember?.callsign} · SOL ${from}–${day}`}
        title="Health journey"
        subtitle="How your body has been doing day by day, and how living in space is changing it."
        actions={
          <div role="group" aria-label="Number of days" className="flex rounded-xl border border-white/10 bg-white/5 p-0.5">
            {RANGES.map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => setRange(r)} className={cn('focus-ring h-10 rounded-lg px-4 text-sm font-semibold', range === r ? 'bg-accent text-space-950' : 'text-slate-300')}>
                {r} days
              </button>
            ))}
          </div>
        }
      />

      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['nominal', 'monitor', 'act', 'critical'] as const).map((l) => (
          <div key={l} className={cn('panel p-4', LEVEL_META[l].border)}>
            <p className="numeral text-3xl" style={{ color: LEVEL_META[l].color }}>
              {count(l)}
            </p>
            <p className="muted text-sm">days "{LEVEL_META[l].label.toLowerCase()}"</p>
          </div>
        ))}
      </div>

      {/* Health map */}
      <Panel className="mb-5" aria-labelledby="map-h" data-tour="journey-map">
        <h2 id="map-h" className="h2 mb-1">
          Health map
        </h2>
        <p className="muted mb-4 text-sm">Each square is one day. Tap a day to see your body on that day.</p>
        <div className="overflow-x-auto pb-2">
          <table className="border-separate border-spacing-[3px]" role="grid" aria-label="Health map: body areas by day">
            <thead>
              <tr>
                <th className="w-32" />
                {journey.map((d) => {
                  const e = evs.find((x) => x.day === d.day);
                  return (
                    <th key={d.day} className="h-5 w-4 p-0 align-bottom text-[9px] font-normal text-slate-400" scope="col">
                      {e ? (
                        <span className="block h-3 w-3 rounded-full" style={{ background: EVENT_STYLE[e.type].color }} title={`SOL ${d.day}: ${e.label}`} aria-label={`SOL ${d.day}: ${e.label}`} />
                      ) : d.day % 10 === 0 ? (
                        d.day
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(['overall', ...SYSTEM_IDS] as const).map((row) => (
                <tr key={row}>
                  <th scope="row" className={cn('whitespace-nowrap pr-2 text-left text-xs', row === 'overall' ? 'font-bold text-white' : 'font-medium text-slate-300')}>
                    {row === 'overall' ? 'Overall' : SYSTEMS[row].short}
                  </th>
                  {journey.map((d) => {
                    const lvl = row === 'overall' ? d.overall : d.systems[row];
                    const label = `SOL ${d.day}, ${row === 'overall' ? 'overall' : SYSTEMS[row].name}: ${d.hasData ? LEVEL_META[lvl].label : 'no check-in'}`;
                    return (
                      <td key={d.day} className="p-0">
                        <button
                          className={cn('focus-ring block h-4 w-4 rounded-[4px] transition-transform hover:scale-125', selected === d.day && 'ring-2 ring-white')}
                          style={{ background: d.hasData ? LEVEL_META[lvl].color : 'rgba(148,163,184,.15)', opacity: d.hasData ? (lvl === 'nominal' ? 0.55 : 1) : 1 }}
                          onClick={() => {
                            setPlaying(false);
                            setSelected(d.day);
                          }}
                          aria-label={label}
                          title={label}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {(['nominal', 'monitor', 'act', 'critical'] as const).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px]" style={{ background: LEVEL_META[l].color }} aria-hidden /> {LEVEL_META[l].label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-slate-400/20" aria-hidden /> No check-in
          </span>
          {evs.map((e) => (
            <span key={e.id} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ background: EVENT_STYLE[e.type].color }} aria-hidden /> SOL {e.day}: {e.label}
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Body replay */}
        <Panel aria-labelledby="replay-h">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="replay-h" className="h2">
              Your body on SOL {selected}
            </h2>
            {sel?.hasData && <StatusBadge level={sel.overall} size="sm" />}
          </div>
          <p className="muted mb-2 min-h-[2.5rem] text-sm">
            {selEvent ? <span className="font-semibold text-white">{selEvent.label}. </span> : null}
            {sel?.hasData ? sel.topAlert ?? 'All body areas normal for you.' : 'No check-in on this day.'}
          </p>
          <p className="muted mb-3 text-xs">
            Press <Play className="inline h-3 w-3" aria-hidden /> to watch your body day by day. Each organ shows how that body area was doing on that day (a glowing outline with “!” = needs attention), and the numbers below show that day&apos;s readings. Drag the slider to pick a day.
          </p>
          <BodyMap levels={levels} heartRate={hrOnDay} onSelect={(id) => navigate(`system/${id}`)} />
          {enoughDays ? (
            <>
              <div className="mt-3 flex items-center gap-3">
                <button
                  className="btn-primary btn-icon h-12 w-12 shrink-0"
                  onClick={() => {
                    if (!playing && selected >= day) setSelected(from);
                    setPlaying((p) => !p);
                  }}
                  aria-label={playing ? 'Pause replay' : 'Replay your journey day by day'}
                >
                  {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
                <label className="sr-only" htmlFor="day-slider">
                  Day
                </label>
                <input
                  id="day-slider"
                  type="range"
                  className="min-w-0 flex-1 accent-cyan-400"
                  min={from}
                  max={day}
                  value={selected}
                  onChange={(e) => {
                    setPlaying(false);
                    setSelected(Number(e.target.value));
                  }}
                />
                <span className="numeral w-16 shrink-0 text-right">SOL {selected}</span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-live={playing ? 'off' : 'polite'}>
                {REPLAY_READINGS.map((id) => {
                  const v = dayCheckIn?.values[id];
                  return (
                    <div key={id} className="rounded-lg bg-white/5 px-2 py-1.5 text-center">
                      <dt className="muted truncate text-[11px]">{INDICATORS[id].short}</dt>
                      <dd className="numeral text-sm">{v === undefined ? '–' : formatValue(id, v, units)}</dd>
                    </div>
                  );
                })}
              </dl>
            </>
          ) : (
            <div className="mt-3 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">
              <p className="font-semibold">The replay needs at least 2 days of check-ins.</p>
              <p className="muted mt-1">
                You have {withData.length} so far (SOL {day}). Do your check-in every day: from tomorrow you can press play and watch how your body changes. (The 90-day demo mission shows a full replay.)
              </p>
              <button className="btn-primary mt-3" onClick={() => navigate('checkin')}>
                <ClipboardCheck className="h-4 w-4" aria-hidden /> Do today&apos;s check-in
              </button>
            </div>
          )}
        </Panel>

        {/* What space is doing to your body */}
        <Panel aria-labelledby="chg-h">
          <h2 id="chg-h" className="h2 mb-1">
            How space is changing your body
          </h2>
          <p className="muted mb-4 text-sm">
            Your first days in this period (SOL {from}) compared with your latest days (SOL {day}).
          </p>
          {!enoughDays ? (
            <p className="muted text-sm">This compares your first days with your latest days, so it needs at least 2 days of check-ins. Come back after a few more daily check-ins.</p>
          ) : changes.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {changes.map((c) => (
                <ChangeCard key={c.indicator} c={c} />
              ))}
            </ul>
          ) : (
            <p className="muted text-sm">Do a few more daily check-ins and this section will show how your body is changing.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
