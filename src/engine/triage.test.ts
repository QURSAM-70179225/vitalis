import { describe, expect, it } from 'vitest';
import type { CheckIn, IndicatorValues, SymptomId } from '@/types';
import { ENVIRONMENTS } from '@/data/environments';
import { generateDemoData } from '@/data/seed';
import { assessIndicator, evaluate, levelFromBands, readinessScore } from './triage';
import { THRESHOLDS, resolveThresholds } from './thresholds';
import { escalationPlan } from './escalation';
import { computeInsights } from './insights';
import { buildSchedule } from './schedule';
import { maxLevel } from './status';

const env = ENVIRONMENTS['mars-transit'];
const iss = ENVIRONMENTS.iss;

const NORMAL: IndicatorValues = {
  heartRate: 60,
  systolic: 115,
  diastolic: 74,
  spo2: 98,
  temperature: 36.7,
  glucose: 88,
  respRate: 14,
  sleepHours: 7.5,
  sleepQuality: 4,
  mood: 4,
  stress: 2,
  fatigue: 2,
  hydration: 2400,
  exerciseResistive: 45,
  exerciseAerobic: 35,
  radiationDose: 1.8,
};

/** Build `days` check-ins; `mod(day)` returns overrides for that day. */
function history(days: number, mod: (d: number) => { values?: IndicatorValues; symptoms?: SymptomId[] } = () => ({})): CheckIn[] {
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const m = mod(day);
    // small deterministic jitter so SD isn't zero
    const jitter = (day % 3) - 1;
    return {
      id: `x${day}`,
      crewId: 'a',
      day,
      timestamp: new Date(2026, 0, day, 7).toISOString(),
      values: { ...NORMAL, heartRate: 60 + jitter, systolic: 115 + jitter, ...m.values },
      symptoms: m.symptoms ?? [],
      source: 'manual',
    };
  });
}

describe('levelFromBands', () => {
  const b = THRESHOLDS.systolic.bands;
  it.each([
    [110, 'nominal'],
    [130, 'monitor'],
    [140, 'act'],
    [180, 'critical'],
    [88, 'act'],
    [79, 'critical'],
  ])('systolic %d → %s', (v, lvl) => {
    expect(levelFromBands(v, b).level).toBe(lvl);
  });
});

describe('maxLevel', () => {
  it('returns the most severe level', () => {
    expect(maxLevel('nominal', 'act', 'monitor')).toBe('act');
    expect(maxLevel()).toBe('nominal');
  });
});

describe('evaluate: baseline layer', () => {
  it('is nominal for a stable history', () => {
    const r = evaluate({ crewId: 'a', checkIns: history(20), environment: env });
    expect(r.overall).toBe('nominal');
    expect(r.alerts).toHaveLength(0);
    expect(r.readiness).toBeGreaterThan(90);
  });

  it('flags "normal on paper, abnormal for you" (HR 18% above baseline for 3 days)', () => {
    const checkIns = history(20, (d) => (d >= 18 ? { values: { heartRate: 71 } } : {}));
    const r = evaluate({ crewId: 'a', checkIns, environment: env });
    const hr = r.indicators.heartRate!;
    expect(hr.absoluteLevel).toBe('nominal'); // 71 bpm is within 45–100
    expect(hr.sustained).toBe('high');
    expect(hr.level).toBe('act');
    expect(hr.reasons[0]).toMatch(/18% above your personal baseline for 3 days/);
    const alert = r.alerts.find((a) => a.id === 'ind-heartRate')!;
    expect(alert.title).toMatch(/abnormal for you/);
    expect(alert.ruleId).toBe('personal-baseline');
  });

  it('flags a single |z| > 2 reading as monitor', () => {
    const checkIns = history(20, (d) => (d === 20 ? { values: { heartRate: 68 } } : {}));
    const r = evaluate({ crewId: 'a', checkIns, environment: env });
    expect(r.indicators.heartRate!.baselineLevel).toBe('monitor');
  });

  it('ignores deviations in the harmless direction', () => {
    const checkIns = history(20, (d) => (d >= 18 ? { values: { spo2: 100 } } : { values: { spo2: 97 } }));
    const r = evaluate({ crewId: 'a', checkIns, environment: env });
    expect(r.indicators.spo2!.level).toBe('nominal');
  });
});

describe('evaluate: absolute layer', () => {
  it('flags absolute thresholds with explanation', () => {
    const r = evaluate({ crewId: 'a', checkIns: history(10, (d) => (d === 10 ? { values: { spo2: 89 } } : {})), environment: env });
    expect(r.indicators.spo2!.absoluteLevel).toBe('act');
    expect(r.indicators.spo2!.reasons[0]).toMatch(/at or below the threshold of 91/);
  });

  it('honours threshold overrides', () => {
    const thresholds = resolveThresholds({ spo2: { actLow: 85, monLow: 88 } });
    const r = evaluate({ crewId: 'a', checkIns: history(10, (d) => (d === 10 ? { values: { spo2: 89 } } : {})), environment: env, thresholds });
    expect(r.indicators.spo2!.absoluteLevel).toBe('nominal');
  });

  it('evaluates body mass relative to mission start', () => {
    const checkIns = history(30, (d) => ({ values: { bodyMass: d <= 7 ? 80 : 75.5 } }));
    const r = evaluate({ crewId: 'a', checkIns, environment: env });
    expect(r.indicators.bodyMass!.absoluteLevel).toBe('act'); // −5.6%
  });

  it('scales radiation thresholds to the environment', () => {
    const dose = (v: number) => history(5, (d) => (d === 5 ? { values: { radiationDose: v } } : {}));
    expect(assessIndicator('radiationDose', [{ day: 1, value: 3 }], THRESHOLDS.radiationDose, env)!.level).toBe('nominal');
    expect(assessIndicator('radiationDose', [{ day: 1, value: 1.5 }], THRESHOLDS.radiationDose, iss)!.level).toBe('monitor');
    const r = evaluate({ crewId: 'a', checkIns: dose(40), environment: env });
    expect(r.alerts[0].ruleId).toBe('solar-particle-event');
    expect(r.alerts[0].level).toBe('critical');
  });
});

describe('evaluate: combination rules', () => {
  it('behavioral health: poor sleep + low mood + high stress for 3+ days', () => {
    const checkIns = history(20, (d) => (d >= 18 ? { values: { sleepHours: 5.5, mood: 2, stress: 4 } } : {}));
    const r = evaluate({ crewId: 'a', checkIns, environment: env });
    const a = r.alerts.find((x) => x.ruleId === 'behavioral-health')!;
    expect(a.level).toBe('act');
    expect(a.why[0]).toMatch(/3 of the last 5 days/);
    expect(a.hazards).toContain('isolation');
  });

  it('behavioral health escalates to critical after 5 of 7 days', () => {
    const checkIns = history(20, (d) => (d >= 16 ? { values: { sleepHours: 5.5, mood: 2, stress: 5 } } : {}));
    const r = evaluate({ crewId: 'a', checkIns, environment: env });
    expect(r.alerts.find((x) => x.ruleId === 'behavioral-health')!.level).toBe('critical');
  });

  it('SANS: rising BP + headache + vision change → contact flight surgeon', () => {
    const checkIns = history(24, (d) => {
      if (d < 18) return {};
      return { values: { systolic: 115 + (d - 17) * 3 }, symptoms: d >= 22 ? ['headache', 'visionChange'] : [] };
    });
    const r = evaluate({ crewId: 'a', checkIns, environment: env });
    const a = r.alerts.find((x) => x.ruleId === 'sans-cluster')!;
    expect(a.level).toBe('critical');
    expect(a.systems).toEqual(['sans', 'cardio']);
    expect(r.overall).toBe('critical');
    expect(r.systems.sans.level).toBe('critical');
  });

  it('SANS: vision change alone → act', () => {
    const r = evaluate({ crewId: 'a', checkIns: history(20, (d) => (d === 20 ? { symptoms: ['visionChange'] } : {})), environment: env });
    expect(r.alerts.find((x) => x.ruleId === 'sans-cluster')!.level).toBe('act');
  });

  it('bone-loss proxy: low resistive adherence + mass loss', () => {
    const checkIns = history(40, (d) => ({
      values: { exerciseResistive: d > 30 ? 15 : 45, bodyMass: d <= 7 ? 80 : 78 },
    }));
    const r = evaluate({ crewId: 'a', checkIns, environment: env });
    const a = r.alerts.find((x) => x.ruleId === 'bone-loss-proxy')!;
    expect(a.level).toBe('act');
    expect(a.why.join(' ')).toMatch(/33% of the 45-min target/);
  });

  it('chest pain is always critical', () => {
    const r = evaluate({ crewId: 'a', checkIns: history(3, (d) => (d === 3 ? { symptoms: ['chestPain'] } : {})), environment: env });
    expect(r.alerts[0].ruleId).toBe('cardiopulmonary-emergency');
    expect(r.overall).toBe('critical');
  });

  it('infection: fever + congestion', () => {
    const r = evaluate({
      crewId: 'a',
      checkIns: history(10, (d) => (d === 10 ? { values: { temperature: 38.2 }, symptoms: ['congestion'] } : {})),
      environment: env,
    });
    expect(r.alerts.find((x) => x.ruleId === 'possible-infection')!.level).toBe('act');
    // the congestion symptom is covered by the rule, not duplicated
    expect(r.alerts.find((x) => x.id === 'sym-congestion')).toBeUndefined();
  });

  it('sleep debt after 3 short nights', () => {
    const r = evaluate({ crewId: 'a', checkIns: history(10, (d) => (d >= 8 ? { values: { sleepHours: 5 } } : {})), environment: env });
    expect(r.alerts.some((x) => x.ruleId === 'sleep-debt')).toBe(true);
  });
});

describe('readiness', () => {
  it('drops with flagged systems and missing check-ins', () => {
    const base = evaluate({ crewId: 'a', checkIns: history(20), environment: env });
    const sys = { ...base.systems, cardio: { ...base.systems.cardio, level: 'act' as const } };
    expect(readinessScore(sys, { checkInDaysLast7: 7 })).toBe(90);
    expect(readinessScore(sys, { checkInDaysLast7: 4 })).toBe(84);
  });
});

describe('escalation', () => {
  it('is comm-delay aware', () => {
    expect(escalationPlan('critical', 600).headline).toMatch(/~20 min.*Start these steps now/);
    expect(escalationPlan('critical', 0.5).realtime).toBe(true);
    expect(escalationPlan('critical', 0.5).headline).toMatch(/now/);
  });
});

describe('demo mission story', () => {
  const demo = generateDemoData(new Date('2026-11-07T12:00:00Z'));
  const run = (crewId: string, asOfDay?: number) =>
    evaluate({ crewId, checkIns: demo.checkIns, cognitive: demo.cognitive, environment: env, asOfDay });

  it('generates 90 days for 4 crew deterministically', () => {
    expect(demo.crew).toHaveLength(4);
    expect(demo.checkIns.length).toBeGreaterThan(340);
    expect(Math.max(...demo.checkIns.map((c) => c.day))).toBe(90);
    const again = generateDemoData(new Date('2026-11-07T12:00:00Z'));
    expect(again.checkIns[100]).toEqual(demo.checkIns[100]);
  });

  it('day 42: solar particle event for the crew', () => {
    for (const c of demo.crew) {
      const r = run(c.id, 42);
      expect(r.alerts.some((a) => a.ruleId === 'solar-particle-event' && a.level === 'critical')).toBe(true);
    }
  });

  it('day 90: Lena has a SANS cluster', () => {
    const r = run('c1');
    expect(r.alerts[0].ruleId).toBe('sans-cluster');
    expect(r.overall).toBe('critical');
  });

  it('day 24: Lena has sleep debt', () => {
    expect(run('c1', 24).alerts.some((a) => a.ruleId === 'sleep-debt')).toBe(true);
  });

  it('Amara: behavioral alert mid-mission that resolves after intervention', () => {
    expect(run('c3', 56).alerts.some((a) => a.ruleId === 'behavioral-health')).toBe(true);
    expect(run('c3', 90).alerts.some((a) => a.ruleId === 'behavioral-health')).toBe(false);
  });

  it('Viktor: bone-loss proxy at day 90', () => {
    const a = run('c4').alerts.find((x) => x.ruleId === 'bone-loss-proxy');
    expect(a?.level).toBe('act');
  });

  it('Kenji: infection early, nominal-ish at day 90', () => {
    expect(run('c2', 13).alerts.some((a) => a.ruleId === 'possible-infection')).toBe(true);
    expect(['nominal', 'monitor']).toContain(run('c2').overall);
  });

  it('produces correlation insights (sleep vs reaction time)', () => {
    const own = demo.checkIns.filter((c) => c.crewId === 'c1');
    const cog = demo.cognitive.filter((c) => c.crewId === 'c1');
    const ins = computeInsights(own, cog);
    const rt = ins.find((i) => i.id === 'sleep-rt');
    expect(rt).toBeDefined();
    expect(rt!.text).toMatch(/reaction time \(pvt\) was \d+% slower/);
  });

  it('schedule adapts to risk (BP twice daily while flagged)', () => {
    const tasks = buildSchedule(90, run('c1'));
    expect(tasks.some((t) => t.id === 'bp-evening' && t.adaptive)).toBe(true);
    const calm = buildSchedule(90, run('c2'));
    expect(calm.some((t) => t.id === 'amsler')).toBe(false);
  });
});

describe('guideline edges are nominal', () => {
  it.each([
    ['sleepHours', 7],
    ['spo2', 95],
    ['hydration', 2000],
  ] as const)('%s = %d is nominal', (id, v) => {
    expect(levelFromBands(v, THRESHOLDS[id].bands).level).toBe('nominal');
  });
});
