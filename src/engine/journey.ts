/**
 * Health journey over many days: day-by-day status of every body area, and a
 * plain-language comparison of how living in space has changed the body.
 */
import type { IndicatorId, StatusLevel, SystemId } from '@/types';
import { INDICATORS } from '@/data/indicators';
import { SYSTEM_IDS } from '@/data/systems';
import { evaluate, type TriageInput } from './triage';
import { buildSeries, type Point } from './series';
import { mean, pctChange } from './baseline';

export interface JourneyDay {
  day: number;
  hasData: boolean;
  overall: StatusLevel;
  readiness: number;
  systems: Record<SystemId, StatusLevel>;
  topAlert?: string;
}

/** Re-run the triage engine as of each day in the range. */
export function healthJourney(input: Omit<TriageInput, 'asOfDay'>, fromDay: number, toDay: number): JourneyDay[] {
  const days = new Set(input.checkIns.filter((c) => c.crewId === input.crewId).map((c) => c.day));
  const out: JourneyDay[] = [];
  for (let d = Math.max(1, fromDay); d <= toDay; d++) {
    if (!days.has(d)) {
      out.push({ day: d, hasData: false, overall: 'nominal', readiness: 0, systems: Object.fromEntries(SYSTEM_IDS.map((s) => [s, 'nominal'])) as Record<SystemId, StatusLevel> });
      continue;
    }
    const t = evaluate({ ...input, asOfDay: d });
    out.push({
      day: d,
      hasData: true,
      overall: t.overall,
      readiness: t.readiness,
      systems: Object.fromEntries(SYSTEM_IDS.map((s) => [s, t.systems[s].level])) as Record<SystemId, StatusLevel>,
      topAlert: t.alerts[0]?.title,
    });
  }
  return out;
}

export interface BodyChange {
  indicator: IndicatorId | 'radiationTotal';
  label: string;
  unit: string;
  start: number;
  end: number;
  pct: number;
  /** good = improved or stable, watch = small change in the wrong way, concern = clear change in the wrong way */
  verdict: 'good' | 'watch' | 'concern';
  headline: string;
  why: string;
}

interface Spec {
  id: IndicatorId;
  worse: 'up' | 'down';
  watchPct: number;
  concernPct: number;
  whyWorse: string;
  whyOk: string;
}

const SPECS: Spec[] = [
  { id: 'bodyMass', worse: 'down', watchPct: 2, concernPct: 5, whyWorse: 'Without gravity your leg and back muscles do less work and many astronauts eat less, so weight drops.', whyOk: 'Your weight is holding steady: your eating and exercise are working.' },
  { id: 'heartRate', worse: 'up', watchPct: 8, concernPct: 15, whyWorse: 'A higher resting heart rate can mean tiredness, stress, dehydration or getting sick.', whyOk: 'Your heart is beating at its usual resting pace.' },
  { id: 'systolic', worse: 'up', watchPct: 5, concernPct: 10, whyWorse: 'In space body fluids move up toward your head. Rising blood pressure is linked to eye and head-pressure changes.', whyOk: 'Your blood pressure is stable.' },
  { id: 'sleepHours', worse: 'down', watchPct: 8, concernPct: 15, whyWorse: 'Strange light cycles, noise and busy schedules on a spacecraft make good sleep harder.', whyOk: 'You are keeping a healthy sleep routine.' },
  { id: 'mood', worse: 'down', watchPct: 10, concernPct: 20, whyWorse: 'Months far from home in a small space can slowly wear down your mood. That is normal, and talking helps.', whyOk: 'Your mood is holding up well.' },
  { id: 'exerciseResistive', worse: 'down', watchPct: 15, concernPct: 30, whyWorse: 'Less strength exercise means your bones and muscles weaken faster without gravity.', whyOk: 'You are keeping up your strength exercise, which protects your bones.' },
  { id: 'reactionTime', worse: 'up', watchPct: 6, concernPct: 12, whyWorse: 'Tiredness and poor sleep make your reactions slower.', whyOk: 'Your reaction speed is as sharp as at the start.' },
];

function windowMean(s: Point[] | undefined, from: number, to: number): number | null {
  const v = (s ?? []).filter((p) => p.day >= from && p.day <= to).map((p) => p.value);
  return v.length ? mean(v) : null;
}

/** Compare the first week of the range with the last week, in plain words. */
export function bodyChanges(input: Pick<TriageInput, 'crewId' | 'checkIns' | 'cognitive'>, fromDay: number, toDay: number): BodyChange[] {
  const series = buildSeries(
    input.checkIns.filter((c) => c.crewId === input.crewId),
    (input.cognitive ?? []).filter((c) => c.crewId === input.crewId),
  );
  const out: BodyChange[] = [];
  const span = Math.max(3, Math.min(7, Math.floor((toDay - fromDay + 1) / 4)));
  for (const sp of SPECS) {
    // Body weight is measured weekly, so use a wider window for it.
    const w = sp.id === 'bodyMass' ? Math.max(span, 10) : span;
    const a = windowMean(series[sp.id], fromDay, fromDay + w - 1);
    const b = windowMean(series[sp.id], toDay - w + 1, toDay);
    if (a === null || b === null) continue;
    const pct = pctChange(b, a);
    const badPct = sp.worse === 'up' ? pct : -pct;
    const verdict: BodyChange['verdict'] = badPct >= sp.concernPct ? 'concern' : badPct >= sp.watchPct ? 'watch' : 'good';
    const meta = INDICATORS[sp.id];
    const dir = Math.abs(pct) < 1 ? 'about the same' : pct > 0 ? `up ${Math.abs(pct).toFixed(0)}%` : `down ${Math.abs(pct).toFixed(0)}%`;
    out.push({
      indicator: sp.id,
      label: meta.label,
      unit: meta.unit,
      start: a,
      end: b,
      pct,
      verdict,
      headline: `${meta.label}: ${dir}`,
      why: verdict === 'good' ? sp.whyOk : sp.whyWorse,
    });
  }
  const dose = series.radiationDose ?? [];
  const total = dose.filter((p) => p.day >= fromDay && p.day <= toDay).reduce((s, p) => s + p.value, 0);
  if (total > 0) {
    const all = dose.filter((p) => p.day <= toDay).reduce((s, p) => s + p.value, 0);
    out.push({
      indicator: 'radiationTotal',
      label: 'Radiation received',
      unit: 'mSv',
      start: all - total,
      end: all,
      pct: 0,
      verdict: all / 600 >= 0.5 ? 'watch' : 'good',
      headline: `Radiation received: +${total.toFixed(0)} mSv in this period`,
      why: `Space has much more radiation than Earth. You have received ${all.toFixed(0)} mSv in total on this mission (NASA's lifetime limit is 600 mSv).`,
    });
  }
  return out;
}
