import { describe, expect, it } from 'vitest';
import { moodCalendar, wellbeingSuggestions } from './wellbeing';
import type { CheckIn } from '@/types';

const ci = (day: number, mood: number): CheckIn => ({ id: `c${day}`, crewId: 'a', day, timestamp: '', values: { mood }, symptoms: [], source: 'manual' });

describe('wellbeing', () => {
  it('builds a mood calendar with gaps', () => {
    const cal = moodCalendar([ci(1, 4), ci(3, 2)], [], 1, 3);
    expect(cal).toEqual([{ day: 1, mood: 4 }, { day: 2, mood: null }, { day: 3, mood: 2 }]);
  });

  it('suggests support when mood is low', () => {
    const r = wellbeingSuggestions({ mood: 1, stress: 5, sleep: 5, recentMoods: [2, 2, 1], daysSinceHome: 6 });
    expect(r.tone).toBe('low');
    expect(r.suggestions.map((s) => s.id)).toEqual(expect.arrayContaining(['breathe', 'home', 'crew']));
    expect(r.message).toMatch(/not alone/);
  });

  it('encourages good habits when doing well', () => {
    const r = wellbeingSuggestions({ mood: 5, stress: 1, sleep: 8, recentMoods: [4, 5, 5], daysSinceHome: 0 });
    expect(r.tone).toBe('good');
    expect(r.suggestions.some((s) => s.id === 'good')).toBe(true);
  });
});
