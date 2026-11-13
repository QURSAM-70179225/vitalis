/**
 * Correlation insights. Compares an outcome indicator across days split by a
 * condition (e.g. sleep < 6 h) and reports the % difference when both groups
 * are large enough to be meaningful. Purely descriptive, with no causal claims.
 */
import type { CheckIn, CognitiveResult, IndicatorId, SymptomId } from '@/types';
import { INDICATORS } from '@/data/indicators';
import { mean, pearson } from './baseline';
import { buildSeries, symptomsByDay } from './series';

export interface Insight {
  id: string;
  text: string;
  effectPct: number;
  nA: number;
  nB: number;
  indicators: IndicatorId[];
  tone: 'positive' | 'negative' | 'neutral';
}

interface Spec {
  id: string;
  condition: IndicatorId;
  test: (v: number) => boolean;
  conditionLabel: string;
  outcome: IndicatorId | { symptom: SymptomId; label: string };
  /** Verb pair for outcome direction when the condition group is higher / lower. */
  words: [string, string];
  /** Whether a higher outcome value is bad. */
  higherIsBad: boolean;
  /** Outcome measured the next day instead of the same day. */
  nextDay?: boolean;
}

const SPECS: Spec[] = [
  { id: 'sleep-rt', condition: 'sleepHours', test: (v) => v < 6, conditionLabel: '<6 h sleep', outcome: 'reactionTime', words: ['slower', 'faster'], higherIsBad: true },
  { id: 'sleep-mood', condition: 'sleepHours', test: (v) => v < 6.5, conditionLabel: '<6.5 h sleep', outcome: 'mood', words: ['higher', 'lower'], higherIsBad: false },
  { id: 'ex-mood', condition: 'exerciseAerobic', test: (v) => v >= 30, conditionLabel: '≥30 min aerobic exercise', outcome: 'mood', words: ['higher', 'lower'], higherIsBad: false },
  { id: 'stress-sleepq', condition: 'stress', test: (v) => v >= 4, conditionLabel: 'high stress', outcome: 'sleepQuality', words: ['higher', 'lower'], higherIsBad: false, nextDay: true },
  { id: 'hyd-headache', condition: 'hydration', test: (v) => v < 2000, conditionLabel: '<2 L fluids', outcome: { symptom: 'headache', label: 'headaches' }, words: ['more common', 'less common'], higherIsBad: true },
  { id: 'sleep-fatigue', condition: 'sleepHours', test: (v) => v < 6, conditionLabel: '<6 h sleep', outcome: 'fatigue', words: ['higher', 'lower'], higherIsBad: true },
];

export function computeInsights(checkIns: CheckIn[], cognitive: CognitiveResult[], minN = 3): Insight[] {
  const series = buildSeries(checkIns, cognitive);
  const sym = symptomsByDay(checkIns);
  const out: Insight[] = [];
  for (const s of SPECS) {
    const cond = series[s.condition];
    if (!cond) continue;
    const a: number[] = [];
    const b: number[] = [];
    for (const p of cond) {
      const d = s.nextDay ? p.day + 1 : p.day;
      let y: number | undefined;
      if (typeof s.outcome === 'string') y = series[s.outcome]?.find((q) => q.day === d)?.value;
      else y = sym.get(d)?.has(s.outcome.symptom) ? 1 : sym.has(d) ? 0 : undefined;
      if (y === undefined) continue;
      (s.test(p.value) ? a : b).push(y);
    }
    if (a.length < minN || b.length < minN) continue;
    const ma = mean(a);
    const mb = mean(b);
    if (mb === 0 && ma === 0) continue;
    const isSymptom = typeof s.outcome !== 'string';
    // Symptom outcomes need enough symptom-days to say anything (and never "0% vs x%").
    if (isSymptom && (ma === 0 || a.filter((v) => v > 0).length + b.filter((v) => v > 0).length < 4)) continue;
    const effect = isSymptom ? (mb === 0 ? 100 : ((ma - mb) / mb) * 100) : ((ma - mb) / mb) * 100;
    if (!Number.isFinite(effect) || Math.abs(effect) < 8) continue;
    const label = typeof s.outcome === 'string' ? `your ${INDICATORS[s.outcome].label.toLowerCase()}` : s.outcome.label;
    const word = effect > 0 ? s.words[0] : s.words[1];
    const bad = (effect > 0) === s.higherIsBad;
    const when = s.nextDay ? `the night after ${s.conditionLabel} days` : `days with ${s.conditionLabel}`;
    const text = isSymptom
      ? `On ${when}, ${label} were ${Math.round(Math.abs(effect))}% ${word} (${Math.round(ma * 100)}% vs ${Math.round(mb * 100)}% of days).`
      : `On ${when}, ${label} was ${Math.round(Math.abs(effect))}% ${word}.`;
    out.push({
      id: s.id,
      text,
      effectPct: effect,
      nA: a.length,
      nB: b.length,
      indicators: [s.condition, ...(typeof s.outcome === 'string' ? [s.outcome] : [])],
      tone: bad ? 'negative' : 'positive',
    });
  }
  return out.sort((x, y) => Math.abs(y.effectPct) - Math.abs(x.effectPct));
}

/** Simple correlation between two indicators over shared days. */
export function correlate(checkIns: CheckIn[], cognitive: CognitiveResult[], x: IndicatorId, y: IndicatorId): { r: number; n: number } {
  const s = buildSeries(checkIns, cognitive);
  const ys = new Map((s[y] ?? []).map((p) => [p.day, p.value]));
  const xs: number[] = [];
  const yv: number[] = [];
  for (const p of s[x] ?? []) {
    const v = ys.get(p.day);
    if (v !== undefined) {
      xs.push(p.value);
      yv.push(v);
    }
  }
  return { r: pearson(xs, yv), n: xs.length };
}
