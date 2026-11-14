import { Database, Radiation } from 'lucide-react';
import { realRadiationForDay } from '@/data/nasa/radiationTimeline';
import type { Point } from '@/engine/series';
import { radiationSummary } from '@/engine/radiation';
import { RULES } from '@/engine/thresholds';
import { LEVEL_META } from '@/engine/status';
import type { MissionEnvironment } from '@/types';
import { resourceById } from '@/data/resources';
import { ExternalLink, Panel } from '@/components/ui';

/** Mission radiation exposure: today, total vs the NASA career limit, peak event. */
export function RadiationPanel({ series, env, realNasaData = false }: { series: Point[]; env: MissionEnvironment; realNasaData?: boolean }) {
  const s = radiationSummary(series);
  const pct = Math.min(100, s.careerFraction * 100);
  const lvl = s.careerFraction >= 0.9 ? 'act' : s.careerFraction >= RULES.careerMonitorFraction ? 'monitor' : 'nominal';
  const todayRatio = s.today !== null ? s.today / env.baselineDoseMsvPerDay : null;
  const csa = resourceById('csa-radiation');
  return (
    <Panel aria-labelledby="rad-h" data-tour="radiation">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="rad-h" className="h2 flex items-center gap-2">
          <Radiation className="h-5 w-5 text-pink-400" aria-hidden /> Radiation exposure
        </h2>
        <ExternalLink href={csa.url} className="text-xs">
          CSA: {csa.title}
        </ExternalLink>
      </div>
      {s.today === null ? (
        <p className="muted text-sm">No dosimeter readings yet. Log your 24-hour dose in the daily check-in, or connect a dose-rate sensor in Live Monitor.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="eyebrow">Today</p>
            <p className="numeral text-2xl">
              {s.today.toFixed(2)} <span className="muted text-xs font-normal">mSv</span>
            </p>
            <p className="muted text-xs">
              {todayRatio!.toFixed(1)}× typical {env.short} ({env.baselineDoseMsvPerDay} mSv/day)
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="eyebrow">Mission total vs NASA career limit</p>
            <p className="numeral text-2xl">
              {s.missionTotal.toFixed(0)} <span className="muted text-xs font-normal">/ {RULES.careerLimitMsv} mSv</span>
            </p>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${Math.round(pct)}% of the career dose limit used`}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: LEVEL_META[lvl].color }} />
            </div>
            <p className="muted mt-1 text-xs">
              {Math.round(pct)}% used{s.daysToLimit !== null ? ` · ~${s.daysToLimit} days left at the current 7-day rate` : ''} · Limit: NASA-STD-3001 (600 mSv)
            </p>
          </div>
          <div>
            <p className="eyebrow">Highest day</p>
            <p className="numeral text-2xl">
              {s.peak!.value.toFixed(1)} <span className="muted text-xs font-normal">mSv</span>
            </p>
            <p className="muted text-xs">
              SOL {s.peak!.day}
              {s.peak!.value / env.baselineDoseMsvPerDay >= 4 ? ' · probable solar particle event' : ''}
              {realNasaData && realRadiationForDay(s.peak!.day) ? ` (${realRadiationForDay(s.peak!.day)!.date})` : ''}
            </p>
          </div>
        </div>
      )}
      {realNasaData && s.today !== null && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="chip border-pink-400/50 text-pink-300">
            <Database className="h-3.5 w-3.5" aria-hidden /> Real NASA data
          </span>
          <span className="muted">
            Demo radiation is measured by NASA&apos;s Curiosity rover (RAD) on its cruise to Mars, 27 Jan to 25 Apr 2012. Day 42 is the real solar storm of 8 Mar 2012.{' '}
            <a href="#/about" className="font-semibold text-accent hover:underline">
              See the data
            </a>
          </span>
        </p>
      )}
    </Panel>
  );
}
