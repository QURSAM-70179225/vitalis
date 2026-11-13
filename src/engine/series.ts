import type { CheckIn, CognitiveResult, IndicatorId, SymptomId } from '@/types';

export interface Point {
  day: number;
  value: number;
}

export type SeriesMap = Partial<Record<IndicatorId, Point[]>>;

/**
 * Collapse check-ins + cognitive results into one chronological daily series per
 * indicator. If several readings exist for one day, the latest one wins.
 */
export function buildSeries(checkIns: CheckIn[], cognitive: CognitiveResult[] = [], asOfDay = Infinity): SeriesMap {
  const byIndicator = new Map<IndicatorId, Map<number, { t: string; v: number }>>();
  const put = (id: IndicatorId, day: number, t: string, v: number) => {
    if (day > asOfDay || !Number.isFinite(v)) return;
    let m = byIndicator.get(id);
    if (!m) byIndicator.set(id, (m = new Map()));
    const prev = m.get(day);
    if (!prev || prev.t <= t) m.set(day, { t, v });
  };
  for (const c of checkIns) {
    for (const [k, v] of Object.entries(c.values) as [IndicatorId, number | undefined][]) {
      if (v !== undefined) put(k, c.day, c.timestamp, v);
    }
  }
  for (const r of cognitive) {
    put('reactionTime', r.day, r.timestamp, r.meanRt);
    put('pvtLapses', r.day, r.timestamp, r.lapses);
  }
  const out: SeriesMap = {};
  for (const [id, m] of byIndicator) {
    out[id] = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([day, { v }]) => ({ day, value: v }));
  }
  return out;
}

/** Symptoms reported per day (union of all check-ins that day). */
export function symptomsByDay(checkIns: CheckIn[], asOfDay = Infinity): Map<number, Set<SymptomId>> {
  const m = new Map<number, Set<SymptomId>>();
  for (const c of checkIns) {
    if (c.day > asOfDay) continue;
    let s = m.get(c.day);
    if (!s) m.set(c.day, (s = new Set()));
    for (const sym of c.symptoms) s.add(sym);
  }
  return m;
}

export function valueOn(series: Point[] | undefined, day: number): number | undefined {
  return series?.find((p) => p.day === day)?.value;
}

export function latest(series: Point[] | undefined): Point | undefined {
  return series && series.length ? series[series.length - 1] : undefined;
}
