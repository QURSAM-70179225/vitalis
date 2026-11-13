import { ArrowRight, BookOpen, PhoneCall } from 'lucide-react';
import type { SystemId, TriageResult } from '@/types';
import { SYSTEMS } from '@/data/systems';
import { INDICATORS, SYMPTOMS } from '@/data/indicators';
import { GUIDANCE } from '@/data/guidance';
import { LEVEL_META } from '@/engine/status';
import { buildSeries, symptomsByDay } from '@/engine/series';
import { useApp } from '@/store/useApp';
import { useCrewData } from '@/hooks/useMission';
import { formatValue } from '@/utils/units';
import { AlertCard } from '@/components/AlertCard';
import { ExternalLink, HazardBadges, Sparkline, StatusBadge } from '@/components/ui';
import { resourceById } from '@/data/resources';

export function SystemPanel({ id, triage, showLink = true }: { id: SystemId; triage: TriageResult; showLink?: boolean }) {
  const sys = SYSTEMS[id];
  const status = triage.systems[id];
  const units = useApp((s) => s.settings.units);
  const { checkIns, cognitive } = useCrewData(triage.crewId);
  const series = buildSeries(checkIns, cognitive);
  const sym = symptomsByDay(checkIns);
  const alerts = triage.alerts.filter((a) => a.systems.includes(id));
  const recentSymptoms = sys.symptoms.filter((s) => {
    for (let d = triage.day - 6; d <= triage.day; d++) if (sym.get(d)?.has(s)) return true;
    return false;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge level={status.level} size="lg" />
        <HazardBadges ids={sys.hazards} />
      </div>
      <section>
        <h3 className="eyebrow mb-1">What it does</h3>
        <p className="text-sm">{sys.whatItDoes}</p>
      </section>
      <section>
        <h3 className="eyebrow mb-1">How spaceflight affects it</h3>
        <p className="text-sm">{sys.spaceflightEffects}</p>
        <p className="muted mt-1 text-xs">
          NASA HRP risk: {sys.hrpRisk} ·{' '}
          <ExternalLink href={resourceById('hrp-risks').url} className="text-xs">
            Risks of Human Spaceflight
          </ExternalLink>
        </p>
      </section>

      {sys.indicators.length > 0 && (
        <section>
          <h3 className="eyebrow mb-2">Current indicators (14-day trend)</h3>
          <ul className="space-y-2">
            {sys.indicators.map((ind) => {
              const a = triage.indicators[ind];
              const s = series[ind] ?? [];
              const meta = INDICATORS[ind];
              const lvl = a?.level ?? 'nominal';
              return (
                <li key={ind}>
                  <a href={`#/trends/${ind}`} className="focus-ring flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 hover:bg-white/10">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEVEL_META[lvl].color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{meta.label}</span>
                      <span className="muted block text-xs">
                        {a?.baseline ? `Your baseline ${formatValue(ind, a.baseline.mean, units)}` : 'Baseline building…'}
                        {' · '}
                        {LEVEL_META[lvl].label}
                      </span>
                    </span>
                    <Sparkline values={s.slice(-14).map((p) => p.value)} color={LEVEL_META[lvl].color} label={`${meta.label} trend`} />
                    <span className="numeral w-24 text-right text-lg">{formatValue(ind, s[s.length - 1]?.value, units)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {recentSymptoms.length > 0 && (
        <section>
          <h3 className="eyebrow mb-1">Symptoms this week</h3>
          <div className="flex flex-wrap gap-1.5">
            {recentSymptoms.map((s) => (
              <span key={s} className="chip border-monitor/50 text-monitor">
                {SYMPTOMS[s].label}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="eyebrow mb-2">Status explanation & actions</h3>
        {alerts.length ? (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <AlertCard key={a.id} alert={a} defaultOpen={i === 0} compact />
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-nominal/10 p-3 text-sm text-nominal">
            All nominal. Readings are within absolute limits and your personal baseline. Keep up the countermeasures below.
          </p>
        )}
      </section>

      <section className="flex items-start gap-2 rounded-xl bg-white/5 p-3 text-sm">
        <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
        <p>
          <span className="font-semibold">When to escalate: </span>
          {sys.escalateWhen}
        </p>
      </section>

      <section>
        <h3 className="eyebrow mb-2">Countermeasures</h3>
        <div className="flex flex-wrap gap-2">
          {sys.guidanceIds.map((g) => (
            <a key={g} href={`#/guidance/${g}`} className="chip focus-ring min-h-[36px] hover:border-accent hover:text-accent">
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> {GUIDANCE[g]?.title}
            </a>
          ))}
        </div>
      </section>

      {showLink && (
        <a href={`#/system/${id}`} className="btn-primary w-full">
          Open full {sys.short} detail <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      )}
    </div>
  );
}
