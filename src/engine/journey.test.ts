import { describe, expect, it } from 'vitest';
import { generateDemoData } from '@/data/seed';
import { ENVIRONMENTS } from '@/data/environments';
import { bodyChanges, healthJourney } from './journey';

const demo = generateDemoData(new Date('2026-11-07T12:00:00Z'));
const env = ENVIRONMENTS['mars-transit'];
const input = (crewId: string) => ({ crewId, checkIns: demo.checkIns, cognitive: demo.cognitive, environment: env });

describe('health journey', () => {
  it('gives one entry per day with system levels', () => {
    const j = healthJourney(input('c1'), 51, 90);
    expect(j).toHaveLength(40);
    expect(j[j.length - 1].systems.sans).toBe('critical'); // SANS cluster on day 90
    expect(j[0].hasData).toBe(true);
  });

  it('shows the solar storm on day 42 for the whole crew', () => {
    for (const c of ['c1', 'c2', 'c3', 'c4']) {
      const day42 = healthJourney(input(c), 42, 42)[0];
      // Real NASA data: the 8 Mar 2012 storm was ~6× normal → "Take action today" (go to the shelter).
      expect(['act', 'critical']).toContain(day42.overall);
    }
  });

  it("shows Amara's mood dip and recovery", () => {
    const j = healthJourney(input('c3'), 40, 90);
    expect(j.find((d) => d.day === 56)!.systems.behavioral).not.toBe('nominal');
    const late = j.filter((d) => d.day >= 76 && d.hasData);
    const fine = late.filter((d) => d.systems.behavioral === 'nominal').length;
    expect(fine / late.length).toBeGreaterThanOrEqual(0.75); // mostly back to normal after the day-58 support
  });
});

describe('body changes', () => {
  it('detects Viktor losing weight and strength exercise over 90 days', () => {
    const ch = bodyChanges(input('c4'), 1, 90);
    expect(ch.find((c) => c.indicator === 'bodyMass')!.verdict).not.toBe('good');
    expect(ch.find((c) => c.indicator === 'exerciseResistive')!.verdict).toBe('concern');
    expect(ch.find((c) => c.indicator === 'exerciseResistive')!.why).toMatch(/bones and muscles/);
  });

  it("detects Lena's rising blood pressure in the last 30 days", () => {
    const bp = bodyChanges(input('c1'), 61, 90).find((c) => c.indicator === 'systolic')!;
    expect(bp.pct).toBeGreaterThan(5);
    expect(bp.headline).toMatch(/up \d+%/);
  });

  it('adds radiation received in the period', () => {
    const r = bodyChanges(input('c2'), 31, 60).find((c) => c.indicator === 'radiationTotal')!;
    expect(r.end).toBeGreaterThan(r.start);
  });
});
