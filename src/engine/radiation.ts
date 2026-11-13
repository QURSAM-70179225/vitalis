/**
 * Radiation exposure summary (pure).
 * Career limit: NASA-STD-3001 Vol. 1 Rev B (2022), 600 mSv effective dose.
 * Background: see the CSA article "Monitoring Radiation for Astronaut Health" (2026)
 * on measuring crew exposure during long-duration missions.
 */
import type { Point } from './series';
import { RULES } from './thresholds';

export interface RadiationSummary {
  /** Latest daily dose, mSv. */
  today: number | null;
  /** Sum of all logged daily doses, mSv. */
  missionTotal: number;
  /** Fraction of the career limit used (0–1+). */
  careerFraction: number;
  /** Mean of the last 7 logged days, mSv/day. */
  weeklyAvg: number | null;
  /** Days at the current 7-day rate until the career limit (null if no rate). */
  daysToLimit: number | null;
  /** Largest single-day dose and its day (e.g. a solar particle event). */
  peak: { day: number; value: number } | null;
}

export function radiationSummary(series: Point[] = [], careerLimit: number = RULES.careerLimitMsv): RadiationSummary {
  if (!series.length) return { today: null, missionTotal: 0, careerFraction: 0, weeklyAvg: null, daysToLimit: null, peak: null };
  const total = series.reduce((s, p) => s + p.value, 0);
  const last7 = series.slice(-7);
  const avg = last7.reduce((s, p) => s + p.value, 0) / last7.length;
  const peak = series.reduce((m, p) => (p.value > m.value ? p : m), series[0]);
  return {
    today: series[series.length - 1].value,
    missionTotal: total,
    careerFraction: total / careerLimit,
    weeklyAvg: avg,
    daysToLimit: avg > 0 ? Math.max(0, Math.floor((careerLimit - total) / avg)) : null,
    peak: { day: peak.day, value: peak.value },
  };
}
