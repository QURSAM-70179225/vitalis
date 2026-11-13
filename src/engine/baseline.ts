/**
 * Personal-baseline math. Pure functions, unit-tested in baseline.test.ts.
 *
 * Method: the personal baseline is the mean/SD of the `window` readings that
 * precede the evaluation window (the most recent `sustainedDays` readings are
 * excluded so a developing trend doesn't contaminate its own baseline).
 */
import type { Baseline } from '@/types';
import { BASELINE } from './thresholds';

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample standard deviation (n − 1). Returns 0 for fewer than 2 values. */
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

/**
 * Baseline from a chronological series, excluding the last `exclude` readings.
 * Returns null when there are fewer than `minReadings` usable points.
 */
export function computeBaseline(
  series: number[],
  opts: { window?: number; exclude?: number; minReadings?: number; minSd?: number } = {},
): Baseline | null {
  const window = opts.window ?? BASELINE.windowDays;
  const exclude = opts.exclude ?? BASELINE.sustainedDays;
  const minReadings = opts.minReadings ?? BASELINE.minReadings;
  const end = Math.max(0, series.length - exclude);
  const slice = series.slice(Math.max(0, end - window), end);
  if (slice.length < minReadings) return null;
  const sd = Math.max(stdDev(slice), opts.minSd ?? 0);
  return { mean: mean(slice), sd, n: slice.length };
}

export function zScore(value: number, b: Baseline): number {
  if (b.sd === 0) return 0;
  return (value - b.mean) / b.sd;
}

export function pctChange(value: number, reference: number): number {
  if (reference === 0) return 0;
  return ((value - reference) / reference) * 100;
}

/**
 * Detects a sustained trend: the last `days` readings all deviate from the
 * baseline in the same direction by at least `minZ`.
 */
export function sustainedDirection(
  series: number[],
  b: Baseline,
  days: number = BASELINE.sustainedDays,
  minZ: number = BASELINE.sustainedZ,
): 'high' | 'low' | null {
  if (series.length < days) return null;
  const tail = series.slice(-days).map((v) => zScore(v, b));
  if (tail.every((z) => z >= minZ)) return 'high';
  if (tail.every((z) => z <= -minZ)) return 'low';
  return null;
}

/** Least-squares slope (units per step). */
export function slope(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (xs[i] - my);
    den += (i - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Rolling baseline band (mean ± 1 SD) for each index, for chart overlays. */
export function rollingBand(
  series: (number | null)[],
  window: number = BASELINE.windowDays,
  minSd = 0,
): ({ lo: number; hi: number; mean: number } | null)[] {
  return series.map((_, i) => {
    const prior = series.slice(Math.max(0, i - window), i).filter((v): v is number => v !== null);
    if (prior.length < BASELINE.minReadings) return null;
    const m = mean(prior);
    const sd = Math.max(stdDev(prior), minSd);
    return { lo: m - sd, hi: m + sd, mean: m };
  });
}

/** Pearson correlation coefficient. */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}
