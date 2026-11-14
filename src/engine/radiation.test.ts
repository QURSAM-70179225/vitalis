import { describe, expect, it } from 'vitest';
import { radiationSummary } from './radiation';
import { generateDemoData } from '@/data/seed';
import { buildSeries } from './series';

describe('radiation summary', () => {
  it('handles no data', () => {
    expect(radiationSummary([])).toMatchObject({ today: null, missionTotal: 0, daysToLimit: null, peak: null });
  });

  it('computes totals, career fraction, peak and days to limit', () => {
    const s = radiationSummary([
      { day: 1, value: 2 },
      { day: 2, value: 40 },
      { day: 3, value: 2 },
    ]);
    expect(s.missionTotal).toBe(44);
    expect(s.careerFraction).toBeCloseTo(44 / 600);
    expect(s.peak).toEqual({ day: 2, value: 40 });
    expect(s.today).toBe(2);
    expect(s.daysToLimit).toBe(Math.floor((600 - 44) / (44 / 3)));
  });

  it('demo mission: SPE on day 42 is the peak, total well below the career limit', () => {
    const demo = generateDemoData(new Date('2026-11-07T12:00:00Z'));
    const series = buildSeries(demo.checkIns.filter((c) => c.crewId === 'c1')).radiationDose!;
    const s = radiationSummary(series);
    expect(s.peak!.day).toBe(42);
    // 90 days of real Curiosity cruise radiation ≈ 160–170 mSv ≈ 27–28 % of the 600 mSv career limit.
    expect(s.careerFraction).toBeGreaterThan(0.24);
    expect(s.careerFraction).toBeLessThan(0.32);
  });
});
