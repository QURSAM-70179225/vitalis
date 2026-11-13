import { describe, expect, it } from 'vitest';
import { nextIsi, summarizePvt, wellbeingScore } from './pvt';

describe('PVT scoring', () => {
  it('computes mean, median, lapses and false starts', () => {
    const s = summarizePvt([250, 260, 270, 600, 80], 1);
    expect(s.trials).toBe(4);
    expect(s.meanRt).toBe(345);
    expect(s.medianRt).toBe(265);
    expect(s.lapses).toBe(1);
    expect(s.falseStarts).toBe(2); // 1 anticipation + 1 sub-100 ms
  });
  it('handles no valid responses', () => {
    expect(summarizePvt([], 3)).toMatchObject({ trials: 0, falseStarts: 3 });
  });
  it('keeps ISI within bounds', () => {
    expect(nextIsi(() => 0)).toBe(2000);
    expect(nextIsi(() => 1)).toBe(8000);
  });
});

describe('wellbeing score', () => {
  it('maps 1–5 answers to 0–100', () => {
    expect(wellbeingScore([1, 1, 1, 1, 1])).toBe(0);
    expect(wellbeingScore([5, 5, 5, 5, 5])).toBe(100);
    expect(wellbeingScore([3, 3, 3, 3, 3])).toBe(50);
  });
});
