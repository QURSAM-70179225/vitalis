import { useMemo, useState } from 'react';
import { Lightbulb, TrendingDown, TrendingUp } from 'lucide-react';
import type { IndicatorId } from '@/types';
import { useApp } from '@/store/useApp';
import { useCrewData, useMissionContext, useTriage } from '@/hooks/useMission';
import { INDICATORS, INDICATOR_IDS, type IndicatorCategory } from '@/data/indicators';
import { computeInsights } from '@/engine/insights';
import { LEVEL_META } from '@/engine/status';
import { cn } from '@/utils';
import { EVENT_STYLE, IndicatorChart } from '@/features/trends/IndicatorChart';
import { HazardBadges, LazyMount, PageHeader, Panel } from '@/components/ui';

const RANGES = [7, 30, 90] as const;
const CATS: { id: IndicatorCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'vitals', label: 'Vitals' },
  { id: 'wellbeing', label: 'Sleep & mood' },
  { id: 'body', label: 'Body & exercise' },
  { id: 'exposure', label: 'Radiation' },
  { id: 'cognitive', label: 'Cognitive' },
];

export default function Trends({ initial }: { initial?: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [cat, setCat] = useState<IndicatorCategory | 'all'>('all');
  const [selected, setSelected] = useState<IndicatorId>(INDICATOR_IDS.includes(initial as IndicatorId) ? (initial as IndicatorId) : 'heartRate');
  const { day, crewMember } = useMissionContext();
  const { checkIns, cognitive } = useCrewData();
  const triage = useTriage();
  const events = useApp((s) => s.events).filter((e) => e.day > day - range && (e.crewIds.length === 0 || e.crewIds.includes(crewMember?.id ?? '')));
  const insights = useMemo(() => computeInsights(checkIns, cognitive), [checkIns, cognitive]);
  const ids = INDICATOR_IDS.filter((i) => cat === 'all' || INDICATORS[i].category === cat);
  const a = triage?.indicators[selected];

  return (
    <>
      <PageHeader
        eyebrow={`${crewMember?.callsign} · trends & analytics`}
        title="Trends"
        subtitle="Green band = normal range. Violet band = YOUR 14-day baseline. VITALIS flags readings that are normal on paper but unusual for you."
        actions={
          <div role="group" aria-label="Time range" className="flex rounded-xl border border-white/10 bg-white/5 p-0.5">
            {RANGES.map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => setRange(r)} className={cn('focus-ring h-10 rounded-lg px-4 text-sm font-semibold', range === r ? 'bg-accent text-space-950' : 'text-slate-300')}>
                {r} d
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <label htmlFor="ind-select" className="sr-only">
            Indicator
          </label>
          <select id="ind-select" className="field mb-4 sm:hidden" value={selected} onChange={(e) => setSelected(e.target.value as IndicatorId)}>
            {INDICATOR_IDS.map((i) => (
              <option key={i} value={i}>
                {INDICATORS[i].label}
              </option>
            ))}
          </select>
          <IndicatorChart indicator={selected} range={range} height={300} />
          {a && (
            <div className="mt-4 grid gap-3 rounded-xl bg-white/5 p-3 text-sm sm:grid-cols-3">
              <div>
                <p className="eyebrow">Status</p>
                <p className={cn('font-semibold', LEVEL_META[a.level].text)}>{LEVEL_META[a.level].label}</p>
              </div>
              <div>
                <p className="eyebrow">Vs your baseline</p>
                <p className="flex items-center gap-1 font-semibold">
                  {a.pctFromBaseline !== null ? (
                    <>
                      {a.pctFromBaseline >= 0 ? <TrendingUp className="h-4 w-4" aria-hidden /> : <TrendingDown className="h-4 w-4" aria-hidden />}
                      {a.pctFromBaseline >= 0 ? '+' : ''}
                      {a.pctFromBaseline.toFixed(1)}% (z {a.z?.toFixed(1)})
                    </>
                  ) : (
                    'n/a'
                  )}
                </p>
              </div>
              <div>
                <p className="eyebrow">Hazards</p>
                <HazardBadges ids={INDICATORS[selected].hazards} compact />
              </div>
              {a.reasons.length > 0 && <p className="sm:col-span-3">Why: {a.reasons.join(' · ')}</p>}
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel aria-labelledby="ins-h" data-tour="insights">
            <h2 id="ins-h" className="h2 mb-3 flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-monitor" aria-hidden /> Correlation insights
            </h2>
            {insights.length ? (
              <ul className="space-y-2">
                {insights.slice(0, 5).map((i) => (
                  <li key={i.id} className={cn('rounded-xl border p-3 text-sm', i.tone === 'negative' ? 'border-act/40 bg-act/10' : 'border-nominal/40 bg-nominal/10')}>
                    {i.text}
                    <span className="muted mt-1 block text-[11px]">
                      Based on {i.nA} vs {i.nB} days · association only, not proof of cause
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted text-sm">Insights appear after about 2 weeks of check-ins and reaction tests.</p>
            )}
          </Panel>
          <Panel aria-labelledby="ev-h">
            <h2 id="ev-h" className="h2 mb-3">
              Mission events
            </h2>
            {events.length ? (
              <ul className="space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start gap-2">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: EVENT_STYLE[e.type].color }} aria-hidden />
                    <span>
                      <span className="font-semibold">SOL {e.day}</span> · {e.label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted text-sm">No events in this period.</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="h2">All indicators</h2>
        <div role="group" aria-label="Category filter" className="flex flex-wrap gap-1.5">
          {CATS.map((c) => (
            <button key={c.id} aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={cn('chip focus-ring min-h-[36px]', cat === c.id && 'border-accent text-accent')}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ids.map((i) => (
          <button key={i} onClick={() => { setSelected(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={cn('panel focus-ring p-4 text-left transition hover:border-white/30', selected === i && 'border-accent')}>
            <LazyMount height={180}>
              <IndicatorChart indicator={i} range={range} height={140} showLegend={false} />
            </LazyMount>
            <span className="sr-only">Show in main chart</span>
          </button>
        ))}
      </div>
    </>
  );
}
