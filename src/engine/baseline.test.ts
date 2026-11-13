import { describe, expect, it } from 'vitest';
import { computeBaseline, mean, pctChange, pearson, rollingBand, slope, stdDev, sustainedDirection, zScore } from './baseline';

describe('baseline math', () => {
  it('computes mean and sample SD', () => {
    expect(mean([2, 4, 4, 4, 5, 5, 7, 9])).toBe(5);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stdDev([5])).toBe(0);
    expect(Number.isNaN(mean([]))).toBe(true);
  });

  it('excludes the evaluation window from the baseline', () => {
    const series = [...Array(14).fill(60), 80, 80, 80];
    const b = computeBaseline(series, { minSd: 0 })!;
    expect(b.mean).toBe(60);
    expect(b.n).toBe(14);
  });

  it('uses only the last 14 readings before the excluded window', () => {
    const series = [...Array(10).fill(100), ...Array(14).fill(50), 1, 1, 1];
    expect(computeBaseline(series)!.mean).toBe(50);
  });

  it('returns null with too few readings', () => {
    expect(computeBaseline([1, 2, 3, 4, 5, 6])).toBeNull();
  });

  it('applies the SD floor', () => {
    const b = computeBaseline(Array(20).fill(60), { minSd: 3 })!;
    expect(b.sd).toBe(3);
    expect(zScore(66, b)).toBe(2);
  });

  it('detects sustained trends in either direction', () => {
    const b = { mean: 60, sd: 3, n: 14 };
    expect(sustainedDirection([60, 66, 67, 68], b)).toBe('high');
    expect(sustainedDirection([60, 54, 53, 50], b)).toBe('low');
    expect(sustainedDirection([60, 66, 61, 68], b)).toBeNull();
    expect(sustainedDirection([66, 67], b)).toBeNull();
  });

  it('computes slope, pct change and correlation', () => {
    expect(slope([1, 2, 3, 4])).toBeCloseTo(1);
    expect(slope([5])).toBe(0);
    expect(pctChange(118, 100)).toBeCloseTo(18);
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
  });

  it('builds a rolling band once enough prior data exists', () => {
    const band = rollingBand([...Array(10).fill(10)], 14, 1);
    expect(band[6]).toBeNull();
    expect(band[7]).toEqual({ lo: 9, hi: 11, mean: 10 });
  });
});
