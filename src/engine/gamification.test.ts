import { describe, expect, it } from 'vitest';
import { computeProgress, crewChallenges, XP } from './gamification';
import type { CheckIn } from '@/types';

const ci = (day: number, values: CheckIn['values'], crewId = 'a'): CheckIn => ({ id: `${crewId}${day}`, crewId, day, timestamp: '', values, symptoms: [], source: 'manual' });

describe('gamification', () => {
  it('awards XP and computes streaks', () => {
    const checks = [1, 2, 3, 5, 6, 7].map((d) => ci(d, { sleepHours: 7.5, exerciseResistive: 45, exerciseAerobic: 30, hydration: 2500 }));
    const p = computeProgress(checks, [], [], [], 7, 90);
    expect(p.xp).toBe(6 * (XP.checkIn + XP.exerciseGoal + XP.sleepGoal));
    expect(p.streak).toBe(3);
    expect(p.badges.find((b) => b.id === 'first-light')!.earned).toBe(true);
    expect(p.badges.find((b) => b.id === 'sleep-commander')!.progressLabel).toBe('3/7 nights');
  });

  it('builds cooperative crew challenges from crew totals', () => {
    const checks = [ci(10, { hydration: 2000 }, 'a'), ci(10, { hydration: 3000 }, 'b'), ci(3, { hydration: 9999 }, 'a')];
    const ch = crewChallenges(checks, 2, 10);
    const hyd = ch.find((c) => c.id === 'hyd')!;
    expect(hyd.current).toBe(5);
    expect(hyd.target).toBe(31);
    expect(ch.find((c) => c.id === 'ci')!.current).toBe(2);
  });
});
