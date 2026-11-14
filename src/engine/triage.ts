/**
 * VITALIS Risk & Triage Engine — transparent, rule-based, explainable.
 *
 * Layer A: absolute thresholds per indicator (thresholds.ts)
 * Layer B: personal-baseline deviation (rolling 14-day mean/SD, |z| > 2, sustained 3-day trends)
 * Layer C: combination rules (rules below) that look across indicators + symptoms
 *
 * Every output carries plain-language `why` strings so nothing is a black box.
 * Decision support only — not a diagnosis.
 */
import type {
  Alert,
  CheckIn,
  CognitiveResult,
  IndicatorAssessment,
  IndicatorId,
  MissionEnvironment,
  StatusLevel,
  SymptomId,
  SystemAssessment,
  SystemId,
  ThresholdBands,
  TriageResult,
} from '@/types';
import { INDICATORS, SYMPTOMS } from '@/data/indicators';
import { SYSTEM_IDS, SYSTEMS } from '@/data/systems';
import { computeBaseline, mean, pctChange, slope, sustainedDirection, zScore } from './baseline';
import { BASELINE, RULES, THRESHOLDS, type ThresholdConfig } from './thresholds';
import { maxLevel, rank } from './status';
import { buildSeries, symptomsByDay, valueOn, type Point, type SeriesMap } from './series';

export interface TriageInput {
  crewId: string;
  checkIns: CheckIn[];
  cognitive?: CognitiveResult[];
  environment: MissionEnvironment;
  thresholds?: Record<IndicatorId, ThresholdConfig>;
  /** Evaluate as of this mission day (defaults to the latest data). */
  asOfDay?: number;
}

/** How many days a reading stays "current" for triage. */
const STALENESS: Partial<Record<IndicatorId, number>> = {
  bodyMass: 10,
  reactionTime: 7,
  pvtLapses: 7,
};
const DEFAULT_STALENESS = 1;

/** Fixed decimals without trailing zeros (6.50 → 6.5, 7.00 → 7). */
const fmt = (v: number, digits = 0) => (digits ? v.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '') : v.toFixed(0));

function digitsFor(id: IndicatorId): number {
  // As many decimals as the input step has (0.25 → 2, 0.1 → 1, 1 → 0).
  const step = INDICATORS[id].step;
  const dec = (String(step).split('.')[1] ?? '').length;
  return Math.min(2, dec);
}

// ---------------------------------------------------------------------------
// Layer A — absolute bands
// ---------------------------------------------------------------------------

export function levelFromBands(value: number, b: ThresholdBands): { level: StatusLevel; bound?: number; dir?: 'high' | 'low' } {
  if (b.critHigh !== undefined && value >= b.critHigh) return { level: 'critical', bound: b.critHigh, dir: 'high' };
  if (b.critLow !== undefined && value <= b.critLow) return { level: 'critical', bound: b.critLow, dir: 'low' };
  if (b.actHigh !== undefined && value >= b.actHigh) return { level: 'act', bound: b.actHigh, dir: 'high' };
  if (b.actLow !== undefined && value <= b.actLow) return { level: 'act', bound: b.actLow, dir: 'low' };
  if (b.monHigh !== undefined && value >= b.monHigh) return { level: 'monitor', bound: b.monHigh, dir: 'high' };
  if (b.monLow !== undefined && value <= b.monLow) return { level: 'monitor', bound: b.monLow, dir: 'low' };
  return { level: 'nominal' };
}

/** Mean of readings within the first 7 mission days of a series (the "pre-flight-like" reference). */
export function startMean(series: Point[]): number {
  if (!series.length) return NaN;
  const first = series[0].day;
  return mean(series.filter((p) => p.day < first + 7).map((p) => p.value));
}

/** Transform a raw value into the space its bands are expressed in. */
function bandValue(id: IndicatorId, raw: number, cfg: ThresholdConfig, series: Point[], env: MissionEnvironment): number {
  if (cfg.mode === 'relativeToStart') return pctChange(raw, startMean(series));
  if (cfg.mode === 'envScaled') return raw / env.baselineDoseMsvPerDay;
  void id;
  return raw;
}

// ---------------------------------------------------------------------------
// Layer A + B — per-indicator assessment
// ---------------------------------------------------------------------------

export function assessIndicator(
  id: IndicatorId,
  series: Point[],
  cfg: ThresholdConfig,
  env: MissionEnvironment,
): IndicatorAssessment | null {
  if (!series.length) return null;
  const meta = INDICATORS[id];
  const last = series[series.length - 1];
  const reasons: string[] = [];
  const d = digitsFor(id);

  // Layer A
  const bv = bandValue(id, last.value, cfg, series, env);
  const abs = levelFromBands(bv, cfg.bands);
  if (abs.level !== 'nominal' && abs.bound !== undefined) {
    if (cfg.mode === 'relativeToStart') {
      reasons.push(`${meta.label} has gone ${bv >= 0 ? 'up' : 'down'} ${fmt(Math.abs(bv), 1)}% since the start of the mission (safe limit: ${fmt(Math.abs(abs.bound))}%)`);
    } else if (cfg.mode === 'envScaled') {
      reasons.push(
        `${meta.label} was ${fmt(last.value, 2)} ${meta.unit}, ${fmt(bv, 1)} times more than normal here (normal: ${fmt(env.baselineDoseMsvPerDay, 2)} ${meta.unit} a day)`,
      );
    } else {
      reasons.push(
        `${meta.label} is ${fmt(last.value, d)} ${meta.unit}, ${abs.dir === 'high' ? 'above' : 'below'} the safe limit of ${fmt(abs.bound, d)}`,
      );
    }
  }

  // Layer B
  let baselineLevel: StatusLevel = 'nominal';
  const values = series.map((p) => p.value);
  const baseline = cfg.baseline ? computeBaseline(values, { minSd: cfg.minSd }) : null;
  let z: number | null = null;
  let pct: number | null = null;
  let sustained: 'high' | 'low' | null = null;
  if (baseline) {
    z = zScore(last.value, baseline);
    pct = pctChange(last.value, baseline.mean);
    sustained = sustainedDirection(values, baseline);
    const worseDir = (dir: 'high' | 'low' | null) => dir !== null && (cfg.worse === 'both' || cfg.worse === dir);
    const zDir: 'high' | 'low' = z >= 0 ? 'high' : 'low';
    const zFlag = Math.abs(z) >= BASELINE.zFlag && worseDir(zDir);
    const trend = worseDir(sustained);
    if (trend) {
      const days = countSustained(values, baseline, sustained as 'high' | 'low');
      reasons.push(
        `${meta.label} has been ${fmt(Math.abs(pct), 0)}% ${sustained === 'high' ? 'higher' : 'lower'} than your normal for ${days} days (your normal: ${fmt(baseline.mean, d)} ${meta.unit})`,
      );
    } else if (zFlag) {
      reasons.push(
        `${meta.label} is much ${zDir === 'high' ? 'higher' : 'lower'} than usual for you (your normal is about ${fmt(baseline.mean, d)} ${meta.unit})`,
      );
    }
    if (trend && Math.abs(z) >= BASELINE.zFlag) baselineLevel = 'act';
    else if (trend || zFlag) baselineLevel = 'monitor';
  }

  return {
    indicator: id,
    value: last.value,
    day: last.day,
    level: maxLevel(abs.level, baselineLevel),
    absoluteLevel: abs.level,
    baselineLevel,
    baseline,
    z,
    pctFromBaseline: pct,
    sustained,
    reasons,
  };
}

function countSustained(values: number[], b: { mean: number; sd: number }, dir: 'high' | 'low'): number {
  let n = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    const z = (values[i] - b.mean) / b.sd;
    if ((dir === 'high' && z >= BASELINE.sustainedZ) || (dir === 'low' && z <= -BASELINE.sustainedZ)) n++;
    else break;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Layer C — combination rules
// ---------------------------------------------------------------------------

interface RuleCtx {
  day: number;
  series: SeriesMap;
  symptoms: Map<number, Set<SymptomId>>;
  assessments: Partial<Record<IndicatorId, IndicatorAssessment>>;
  env: MissionEnvironment;
  thresholds: Record<IndicatorId, ThresholdConfig>;
}

type Rule = (ctx: RuleCtx) => Alert | null;

function hadSymptom(ctx: RuleCtx, s: SymptomId, withinDays: number): boolean {
  for (let d = ctx.day - withinDays + 1; d <= ctx.day; d++) if (ctx.symptoms.get(d)?.has(s)) return true;
  return false;
}

function window(ctx: RuleCtx, id: IndicatorId, days: number): Point[] {
  return (ctx.series[id] ?? []).filter((p) => p.day > ctx.day - days && p.day <= ctx.day);
}

const solarParticleEvent: Rule = (ctx) => {
  const v = valueOn(ctx.series.radiationDose, ctx.day) ?? valueOn(ctx.series.radiationDose, ctx.day - 1);
  if (v === undefined) return null;
  const cfg = ctx.thresholds.radiationDose;
  const ratio = v / ctx.env.baselineDoseMsvPerDay;
  const actAt = cfg.bands.actHigh ?? 4;
  const critAt = cfg.bands.critHigh ?? 8;
  if (ratio < actAt) return null;
  return {
    id: `spe-${ctx.day}`,
    ruleId: 'solar-particle-event',
    level: ratio >= critAt ? 'critical' : 'act',
    title: 'Radiation spike: likely a solar storm. Go to the shelter',
    why: [
      `Dosimeter read ${fmt(v, 2)} mSv in 24 h, ${fmt(ratio, 1)}× the typical ${ctx.env.short} level`,
      'A sudden jump like this usually means a solar storm (a burst of particles from the Sun)',
    ],
    systems: ['immune', 'skin', 'sans'],
    hazards: ['radiation', 'distance'],
    guidanceIds: ['radiation-shelter'],
    actions: [
      'Go to the storm shelter now (the best-protected area, for example crew quarters surrounded by water tanks)',
      'Keep your radiation badge (dosimeter) on your chest and write down the reading every 30 minutes',
      'Stay in the shelter until the reading is back below double the normal level',
      'Do not go on a spacewalk',
      'Drink fluids and report any nausea, vomiting or fatigue',
    ],
    escalateWhen: 'You feel sick or vomit within a few hours, or the storm total goes above 100 mSv.',
    indicators: ['radiationDose'],
  };
};

const cumulativeDose: Rule = (ctx) => {
  const total = (ctx.series.radiationDose ?? []).reduce((s, p) => s + p.value, 0);
  const frac = total / RULES.careerLimitMsv;
  if (frac < RULES.careerMonitorFraction) return null;
  return {
    id: 'cumulative-dose',
    ruleId: 'cumulative-dose',
    level: frac >= 0.9 ? 'act' : 'monitor',
    title: 'Your total radiation is getting close to the lifetime limit',
    why: [`You have received ${fmt(total, 0)} mSv this mission, ${fmt(frac * 100, 0)}% of NASA's 600 mSv lifetime limit`],
    systems: ['immune'],
    hazards: ['radiation'],
    guidanceIds: ['radiation-shelter'],
    actions: ['Sleep and relax in the best-protected parts of the ship', 'Check spacewalk plans with the doctors on Earth'],
    escalateWhen: 'Above 90% of the career limit.',
    indicators: ['radiationDose'],
  };
};

const behavioralHealth: Rule = (ctx) => {
  const badDays: number[] = [];
  for (let d = ctx.day - 6; d <= ctx.day; d++) {
    const sleep = valueOn(ctx.series.sleepHours, d);
    const sq = valueOn(ctx.series.sleepQuality, d);
    const mood = valueOn(ctx.series.mood, d);
    const stress = valueOn(ctx.series.stress, d);
    if (mood === undefined || stress === undefined) continue;
    const poorSleep = (sleep !== undefined && sleep < 6.5) || (sq !== undefined && sq <= 2);
    if (poorSleep && mood <= 2 && stress >= 4) badDays.push(d);
  }
  const last5 = badDays.filter((d) => d > ctx.day - 5).length;
  if (last5 < RULES.behavioralDays) return null;
  const level: StatusLevel = badDays.length >= RULES.behavioralContactDays ? 'critical' : 'act';
  return {
    id: 'behavioral',
    ruleId: 'behavioral-health',
    level,
    title: 'Your sleep, mood and stress need some care',
    why: [
      `Poor sleep, low mood and high stress together on ${last5} of the last 5 days`,
      ...(badDays.length >= RULES.behavioralContactDays ? [`Pattern present on ${badDays.length} of the last 7 days`] : []),
      'Being far from home in a small space for a long time affects everyone',
    ],
    systems: ['behavioral'],
    hazards: ['isolation', 'distance'],
    guidanceIds: ['breathing', 'sleep-hygiene', 'connect-home', 'workload'],
    actions: [
      'Do the 2-minute calm-breathing exercise now (4-7-8 breathing)',
      'Tell your crew medical officer how you have been feeling',
      'Book a private video call with your family or a counselor',
      'Ask the crew to lighten your workload and give you a quiet sleep time tonight',
    ],
    escalateWhen: "If you have thoughts of hurting yourself, or can't do important tasks, tell your crew medical officer right away.",
    indicators: ['mood', 'stress', 'sleepHours', 'sleepQuality'],
  };
};

const sansCluster: Rule = (ctx) => {
  const headache = hadSymptom(ctx, 'headache', 3);
  const vision = hadSymptom(ctx, 'visionChange', 3);
  const sys = ctx.assessments.systolic;
  const sysWindow = window(ctx, 'systolic', 7).map((p) => p.value);
  const sysSlope = slope(sysWindow);
  const bpRising =
    !!sys &&
    (sys.sustained === 'high' || (sys.z ?? 0) >= BASELINE.sustainedZ || sys.absoluteLevel !== 'nominal' || sysSlope >= 0.8);

  const why: string[] = [];
  if (bpRising && sys) {
    if (sys.pctFromBaseline !== null) why.push(`Blood pressure ${fmt(sys.value)} mmHg, ${fmt(sys.pctFromBaseline, 0)}% higher than your normal`);
    else why.push(`Blood pressure ${fmt(sys.value)} mmHg`);
    if (sysSlope >= 0.8) why.push(`Going up about ${fmt(sysSlope, 1)} mmHg every day this week`);
  }
  if (headache) why.push('Headache reported in the last 3 days');
  if (vision) why.push('Blurry or changed eyesight reported in the last 3 days');

  let level: StatusLevel | null = null;
  let title = '';
  if (bpRising && headache && vision) {
    level = 'critical';
    title = 'Eye and head pressure check: blood pressure rising, headaches and blurry vision';
  } else if (vision) {
    level = 'act';
    title = 'Your eyesight changed: do an eye check';
  } else if (bpRising && headache) {
    level = 'monitor';
    title = 'Blood pressure going up, with headaches';
  }
  if (!level) return null;
  return {
    id: 'sans',
    ruleId: 'sans-cluster',
    level,
    title,
    why,
    systems: ['sans', 'cardio'],
    hazards: ['gravity', 'environment'],
    guidanceIds: ['sans-check', 'bp-recheck', 'co2'],
    actions: [
      'Do the eye-grid test and the reading-card test (Guidance → Eye self-check) and save the results',
      'Check your blood pressure again in 15 minutes, sitting and relaxed, then twice a day',
      'Look at the cabin air (CO₂) reading. If it is above 3, ask the crew to clean the air more',
      'Ask your crew medical officer for an eye scan',
      'Avoid heavy lifting and holding your breath while straining until a doctor has checked',
    ],
    escalateWhen: "You suddenly can't see well, have a very bad headache, or blood pressure is 180/120 or higher. This is an emergency.",
    indicators: ['systolic', 'diastolic'],
  };
};

const boneLoss: Rule = (ctx) => {
  const res = window(ctx, 'exerciseResistive', 7);
  if (res.length < 4) return null;
  const avg = mean(res.map((p) => p.value));
  const adherence = avg / RULES.resistiveTargetMin;
  const mass = ctx.assessments.bodyMass;
  const massPct = mass ? pctChange(mass.value, startMean(ctx.series.bodyMass ?? [])) : 0;
  const lowAdherence = adherence < RULES.boneAdherenceAct;
  const massDown = massPct <= -2;
  if (!lowAdherence) return null;
  return {
    id: 'bone',
    ruleId: 'bone-loss-proxy',
    level: massDown ? 'act' : 'monitor',
    title: massDown ? 'Your bones and muscles may be getting weaker' : 'Not enough strength exercise',
    why: [
      `Strength exercise was ${fmt(avg)} min a day this week (${fmt(adherence * 100)}% of the ${RULES.resistiveTargetMin}-min goal)`,
      ...(massDown ? [`Your weight is down ${fmt(Math.abs(massPct), 1)}% since the start of the mission`] : []),
      "Without gravity, bones in your hips and spine can lose 1–1.5% of their strength every month if you don't exercise",
    ],
    systems: ['musculoskeletal'],
    hazards: ['gravity'],
    guidanceIds: ['resistive', 'nutrition-bone', 'aerobic'],
    actions: [
      'Go back to your full strength workout: squats, deadlifts and heel raises',
      'Ask the crew to protect your exercise block on the schedule',
      'Eat all of your meals, including the protein, and take your vitamin D if you have it',
      'Weigh yourself once a week',
    ],
    escalateWhen: 'You lose more than 5% of your weight, or get sudden pain in your back or side.',
    indicators: ['exerciseResistive', 'bodyMass'],
  };
};

const infection: Rule = (ctx) => {
  const t = valueOn(ctx.series.temperature, ctx.day);
  if (t === undefined || t < RULES.feverForInfection) return null;
  const supporting: string[] = [];
  if (hadSymptom(ctx, 'congestion', 2)) supporting.push('a stuffy nose');
  if (hadSymptom(ctx, 'fever', 2)) supporting.push('chills / feeling feverish');
  const fatigue = valueOn(ctx.series.fatigue, ctx.day);
  if (fatigue !== undefined && fatigue >= 4) supporting.push('strong tiredness');
  const rr = valueOn(ctx.series.respRate, ctx.day);
  if (rr !== undefined && rr >= 21) supporting.push(`breathing rate ${rr}/min`);
  if (!supporting.length) return null;
  return {
    id: 'infection',
    ruleId: 'possible-infection',
    level: t >= (ctx.thresholds.temperature.bands.critHigh ?? 39.5) ? 'critical' : 'act',
    title: 'You may be getting sick (possible infection)',
    why: [`Your temperature is ${fmt(t, 1)} °C and you have ${supporting.join(', ')}`],
    systems: ['immune', 'lungs'],
    hazards: ['environment', 'isolation'],
    guidanceIds: ['infection', 'hydration'],
    actions: [
      'Recheck your temperature in 4 hours',
      'Wear a mask in shared modules and wipe down shared surfaces',
      'Drink at least 2.5 L of fluids today and rest',
      'Ask your crew medical officer about fever medicine from the medical kit',
    ],
    escalateWhen: 'Temperature at or above 39.5 °C, fever beyond 48 h, or difficulty breathing.',
    indicators: ['temperature', 'respRate'],
  };
};

const renalStone: Rule = (ctx) => {
  const hyd = window(ctx, 'hydration', RULES.lowHydrationDays);
  const lowDays = hyd.filter((p) => p.value < 2000).length;
  if (hyd.length < RULES.lowHydrationDays || lowDays < RULES.lowHydrationDays) return null;
  const back = hadSymptom(ctx, 'backPain', 2);
  return {
    id: 'renal',
    ruleId: 'renal-stone-risk',
    level: back ? 'act' : 'monitor',
    title: back ? 'Kidney stone warning: not enough water and back pain' : 'Not drinking enough water: kidney stone risk',
    why: [
      `You drank less than 2 liters a day for ${lowDays} days in a row (last: ${fmt(hyd[hyd.length - 1].value)} mL)`,
      ...(back ? ['Back or flank pain reported'] : []),
      'In space your bones release calcium, and with too little water it can form kidney stones',
    ],
    systems: ['gi', 'musculoskeletal'],
    hazards: ['gravity', 'distance'],
    guidanceIds: ['hydration'],
    actions: ['Drink one 250 mL drink bag every hour while awake today (aim for 2.5–3 liters)', 'Check your pee color. It should be pale yellow.'],
    escalateWhen: 'Severe one-sided flank pain, blood in urine, or fever with back pain.',
    indicators: ['hydration'],
  };
};

const cardioEmergency: Rule = (ctx) => {
  const chest = hadSymptom(ctx, 'chestPain', 1);
  const sob = hadSymptom(ctx, 'shortnessOfBreath', 1);
  const spo2 = valueOn(ctx.series.spo2, ctx.day);
  const hypoxic = spo2 !== undefined && spo2 < 90 && sob;
  if (!chest && !hypoxic) return null;
  return {
    id: 'cardio-emergency',
    ruleId: 'cardiopulmonary-emergency',
    level: 'critical',
    title: chest ? 'Chest pain: treat as an emergency' : 'Low oxygen and hard to breathe',
    why: [
      ...(chest ? ['Chest pain or pressure reported today'] : []),
      ...(hypoxic ? [`Oxygen in your blood is ${spo2}% and you are short of breath`] : []),
    ],
    systems: ['cardio', 'lungs'],
    hazards: ['distance', 'environment'],
    guidanceIds: ['emergency-cardio'],
    actions: [
      'Stop all activity and alert the crew now',
      'Medical officer: attach the heart monitor and check vital signs every 5 minutes',
      'Put on the oxygen mask if blood oxygen is below 92%',
      'Follow the onboard cardiac emergency procedure from the medical checklist',
    ],
    escalateWhen: 'Now. Contact the flight surgeon and do not wait for the ground before starting the steps.',
    indicators: ['spo2', 'heartRate'],
  };
};

const sleepDebt: Rule = (ctx) => {
  const nights = window(ctx, 'sleepHours', RULES.sleepDebtNights);
  if (nights.length < RULES.sleepDebtNights || !nights.every((p) => p.value < RULES.sleepDebtHours)) return null;
  const debt = nights.reduce((s, p) => s + (8 - p.value), 0);
  const rt = ctx.assessments.reactionTime;
  return {
    id: 'sleep-debt',
    ruleId: 'sleep-debt',
    level: 'act',
    title: 'Not enough sleep for several nights',
    why: [
      `Less than ${RULES.sleepDebtHours} hours of sleep for ${nights.length} nights in a row (about ${fmt(debt, 1)} hours missing)`,
      ...(rt && rt.level !== 'nominal' ? [`Your reactions are slower too (${fmt(rt.value)} ms)`] : []),
    ],
    systems: ['behavioral'],
    hazards: ['isolation', 'environment'],
    guidanceIds: ['sleep-hygiene', 'workload'],
    actions: [
      'Get 8.5 hours in bed tonight. Ask to move tasks if you need to.',
      'Switch the lights to the warm "bedtime" setting 2 hours before sleep',
      'Avoid caffeine within 6 h of sleep',
      "Don't do spacewalks, docking or robot-arm work until you have rested",
    ],
    escalateWhen: "You nod off during important tasks, or don't feel better after 3 good nights.",
    indicators: ['sleepHours', 'sleepQuality'],
  };
};

const motionSickness: Rule = (ctx) => {
  if (!hadSymptom(ctx, 'nausea', 1)) return null;
  const dizzy = hadSymptom(ctx, 'dizziness', 1);
  return {
    id: 'motion-sickness',
    ruleId: 'space-motion-sickness',
    level: 'monitor',
    title: 'Feeling sick to your stomach (space sickness)',
    why: ['You said you feel sick to your stomach today', ...(dizzy ? ['You also feel dizzy'] : [])],
    systems: ['gi'],
    hazards: ['gravity'],
    guidanceIds: ['motion-sickness', 'hydration'],
    actions: ["Keep your head still and line your body up with the room's 'up'", 'Take small sips of water', 'Ask your crew medical officer about anti-sickness medicine'],
    escalateWhen: 'You keep vomiting for more than a day, or feel sick after a radiation spike.',
    indicators: [],
  };
};

const orthostatic: Rule = (ctx) => {
  if (!hadSymptom(ctx, 'dizziness', 1)) return null;
  const sys = valueOn(ctx.series.systolic, ctx.day);
  if (sys === undefined || sys >= 100) return null;
  return {
    id: 'orthostatic',
    ruleId: 'orthostatic-intolerance',
    level: 'act',
    title: 'Dizziness with low blood pressure',
    why: [`Systolic BP ${sys} mmHg with dizziness`, ...(ctx.env.gravityG > 0 ? [`Adapting to ${ctx.env.gravityG} g after weightlessness`] : [])],
    systems: ['cardio'],
    hazards: ['gravity'],
    guidanceIds: ['orthostatic', 'hydration'],
    actions: ['Sit or lie down, then stand up slowly', 'Drink 1 liter of water with salt tablets', 'Wear your tight compression clothing'],
    escalateWhen: 'Fainting or chest pain.',
    indicators: ['systolic'],
  };
};

export const RULESET: { id: string; name: string; description: string; fn: Rule }[] = [
  { id: 'cardiopulmonary-emergency', name: 'Cardiopulmonary emergency', description: 'Chest pain, or SpO₂ < 90% with shortness of breath → 🔴', fn: cardioEmergency },
  { id: 'solar-particle-event', name: 'Solar particle event', description: 'Daily dose ≥ 4× environment baseline → 🟠, ≥ 8× → 🔴 shelter protocol', fn: solarParticleEvent },
  { id: 'sans-cluster', name: 'SANS cluster', description: 'Rising BP + headache + vision change within 3 days → 🔴; vision change alone → 🟠', fn: sansCluster },
  { id: 'behavioral-health', name: 'Behavioral health', description: 'Poor sleep + mood ≤ 2 + stress ≥ 4 on ≥ 3 of 5 days → 🟠; ≥ 5 of 7 → 🔴', fn: behavioralHealth },
  { id: 'sleep-debt', name: 'Sleep debt', description: '< 6 h sleep for 3 consecutive nights → 🟠', fn: sleepDebt },
  { id: 'bone-loss-proxy', name: 'Bone-loss proxy', description: 'Resistive exercise < 60% of target (7-day) → 🟡; plus body mass ↓ ≥ 2% → 🟠', fn: boneLoss },
  { id: 'possible-infection', name: 'Possible infection', description: 'Temp ≥ 37.8 °C plus congestion, chills, fatigue or high RR → 🟠', fn: infection },
  { id: 'renal-stone-risk', name: 'Kidney stone risk', description: 'Fluids < 2 L for 3 days → 🟡; plus back pain → 🟠', fn: renalStone },
  { id: 'orthostatic-intolerance', name: 'Orthostatic intolerance', description: 'Dizziness with systolic < 100 mmHg → 🟠', fn: orthostatic },
  { id: 'space-motion-sickness', name: 'Space motion sickness', description: 'Nausea reported → 🟡', fn: motionSickness },
  { id: 'cumulative-dose', name: 'Cumulative dose', description: 'Mission dose ≥ 50% of 600 mSv career limit → 🟡', fn: cumulativeDose },
];

// ---------------------------------------------------------------------------
// Indicator-level alerts (for flagged readings not already covered by a rule)
// ---------------------------------------------------------------------------

const INDICATOR_GUIDANCE: Record<IndicatorId, string[]> = {
  heartRate: ['aerobic', 'hydration', 'infection'],
  systolic: ['bp-recheck', 'hydration'],
  diastolic: ['bp-recheck'],
  spo2: ['co2', 'breathing'],
  temperature: ['infection', 'hydration'],
  glucose: ['nutrition-bone'],
  respRate: ['co2', 'breathing'],
  sleepHours: ['sleep-hygiene'],
  sleepQuality: ['sleep-hygiene'],
  mood: ['connect-home', 'breathing'],
  stress: ['breathing', 'workload'],
  fatigue: ['sleep-hygiene', 'workload'],
  bodyMass: ['nutrition-bone', 'resistive'],
  hydration: ['hydration'],
  exerciseResistive: ['resistive'],
  exerciseAerobic: ['aerobic'],
  radiationDose: ['radiation-shelter'],
  reactionTime: ['sleep-hygiene', 'workload'],
  pvtLapses: ['sleep-hygiene', 'workload'],
};

const INDICATOR_ACTION: Partial<Record<IndicatorId, string>> = {
  heartRate: 'Recheck resting heart rate in 1 hour after 5 minutes of rest',
  systolic: 'Recheck blood pressure in 15 minutes, seated, arm at heart level',
  diastolic: 'Recheck blood pressure in 15 minutes',
  spo2: 'Warm your hand and remeasure. Check the cabin CO₂ and O₂ readouts.',
  temperature: 'Recheck temperature in 4 hours',
  glucose: 'Recheck glucose. If below 70, take 15 g of fast carbohydrate and recheck in 15 minutes.',
  respRate: 'Recount breaths at rest for a full minute',
  sleepHours: 'Plan a protected sleep window tonight',
  sleepQuality: 'Review the sleep hygiene checklist',
  mood: 'Try the 4-7-8 breathing exercise and consider a call home',
  stress: 'Take a 5-minute break and do the breathing exercise',
  fatigue: 'Avoid scheduling critical tasks while fatigued',
  bodyMass: 'Eat your full ration. Log your meals for 3 days.',
  hydration: 'Drink an extra 500 mL in the next 2 hours',
  exerciseResistive: 'Complete your resistive block today',
  exerciseAerobic: 'Complete your aerobic block today',
  radiationDose: 'Check space weather status. Move to the shelter if the dose stays high.',
  reactionTime: 'Repeat the reaction test after rest',
  pvtLapses: 'Repeat the reaction test after rest',
};

function indicatorAlert(a: IndicatorAssessment): Alert {
  const meta = INDICATORS[a.indicator];
  const sys = meta.systems[0];
  return {
    id: `ind-${a.indicator}`,
    ruleId: a.absoluteLevel !== 'nominal' ? 'absolute-threshold' : 'personal-baseline',
    level: a.level,
    title:
      a.absoluteLevel === 'nominal'
        ? `${meta.label}: unusual for you`
        : `${meta.label} ${a.absoluteLevel === 'critical' ? 'is at a dangerous level' : 'is outside the safe range'}`,
    why: a.reasons.length ? a.reasons : [`${meta.label} flagged`],
    systems: meta.systems,
    hazards: meta.hazards,
    guidanceIds: INDICATOR_GUIDANCE[a.indicator],
    actions: [INDICATOR_ACTION[a.indicator] ?? 'Recheck the reading', 'Log any symptoms in your next check-in'],
    escalateWhen: SYSTEMS[sys].escalateWhen,
    indicators: [a.indicator],
  };
}

const SYMPTOM_LEVEL: Partial<Record<SymptomId, StatusLevel>> = {
  headache: 'monitor',
  backPain: 'monitor',
  skinRash: 'monitor',
  congestion: 'monitor',
  insomnia: 'monitor',
  muscleCramps: 'monitor',
  dizziness: 'monitor',
  fever: 'monitor',
  shortnessOfBreath: 'act',
};

const SYMPTOM_GUIDANCE: Partial<Record<SymptomId, string[]>> = {
  headache: ['co2', 'hydration'],
  backPain: ['back-pain'],
  skinRash: ['skin-care'],
  congestion: ['infection'],
  insomnia: ['sleep-hygiene'],
  muscleCramps: ['hydration', 'resistive'],
  dizziness: ['orthostatic'],
  fever: ['infection'],
  shortnessOfBreath: ['co2', 'breathing'],
};

// ---------------------------------------------------------------------------
// Readiness score (0–100)
// ---------------------------------------------------------------------------

export const READINESS_PENALTY: Record<StatusLevel, number> = { nominal: 0, monitor: 4, act: 10, critical: 22 };

export function readinessScore(
  systems: Record<SystemId, SystemAssessment>,
  opts: { checkInDaysLast7: number; sleepAvg?: number; exerciseAdherence?: number },
): number {
  let score = 100;
  for (const s of Object.values(systems)) score -= READINESS_PENALTY[s.level];
  score -= Math.max(0, 7 - opts.checkInDaysLast7) * 2;
  if (opts.sleepAvg !== undefined && opts.sleepAvg < 7) score -= Math.min(10, (7 - opts.sleepAvg) * 4);
  if (opts.exerciseAdherence !== undefined && opts.exerciseAdherence < 1) score -= Math.min(8, (1 - opts.exerciseAdherence) * 10);
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function evaluate(input: TriageInput): TriageResult {
  const thresholds = input.thresholds ?? THRESHOLDS;
  const own = input.checkIns.filter((c) => c.crewId === input.crewId);
  const cog = (input.cognitive ?? []).filter((c) => c.crewId === input.crewId);
  const lastDay = Math.max(0, ...own.map((c) => c.day), ...cog.map((c) => c.day));
  const day = input.asOfDay ?? lastDay;
  const series = buildSeries(own, cog, day);
  const symptoms = symptomsByDay(own, day);

  // Layer A + B
  const assessments: Partial<Record<IndicatorId, IndicatorAssessment>> = {};
  for (const id of Object.keys(series) as IndicatorId[]) {
    const s = series[id]!;
    const lastPoint = s[s.length - 1];
    if (!lastPoint || day - lastPoint.day > (STALENESS[id] ?? DEFAULT_STALENESS)) continue;
    const a = assessIndicator(id, s, thresholds[id], input.environment);
    if (a) assessments[id] = a;
  }

  // Layer C
  const ctx: RuleCtx = { day, series, symptoms, assessments, env: input.environment, thresholds };
  const alerts: Alert[] = [];
  const covered = new Set<IndicatorId>();
  for (const r of RULESET) {
    const a = r.fn(ctx);
    if (a) {
      alerts.push(a);
      a.indicators.forEach((i) => covered.add(i));
    }
  }
  for (const a of Object.values(assessments)) {
    if (a && rank(a.level) > 0 && !covered.has(a.indicator)) alerts.push(indicatorAlert(a));
  }
  // Symptoms not covered by a rule.
  const todaySymptoms = symptoms.get(day) ?? new Set<SymptomId>();
  const ruleSymptomCovered = new Set<SymptomId>();
  if (alerts.some((a) => a.ruleId === 'sans-cluster')) ['headache', 'visionChange'].forEach((s) => ruleSymptomCovered.add(s as SymptomId));
  if (alerts.some((a) => a.ruleId === 'cardiopulmonary-emergency')) ['chestPain', 'shortnessOfBreath'].forEach((s) => ruleSymptomCovered.add(s as SymptomId));
  if (alerts.some((a) => a.ruleId === 'space-motion-sickness')) ['nausea', 'dizziness'].forEach((s) => ruleSymptomCovered.add(s as SymptomId));
  if (alerts.some((a) => a.ruleId === 'possible-infection')) ['fever', 'congestion'].forEach((s) => ruleSymptomCovered.add(s as SymptomId));
  if (alerts.some((a) => a.ruleId === 'renal-stone-risk')) ruleSymptomCovered.add('backPain');
  if (alerts.some((a) => a.ruleId === 'orthostatic-intolerance')) ruleSymptomCovered.add('dizziness');
  for (const s of todaySymptoms) {
    const level = SYMPTOM_LEVEL[s];
    if (!level || ruleSymptomCovered.has(s)) continue;
    const meta = SYMPTOMS[s];
    alerts.push({
      id: `sym-${s}`,
      ruleId: 'symptom',
      level,
      title: `Symptom reported: ${meta.label}`,
      why: [`${meta.label} reported in today's check-in. ${meta.hint}`],
      systems: meta.systems,
      hazards: meta.hazards,
      guidanceIds: SYMPTOM_GUIDANCE[s] ?? [],
      actions: ['Note when it started and how severe it is (1–10)', 'Report it again in your next check-in if it continues'],
      escalateWhen: SYSTEMS[meta.systems[0]].escalateWhen,
      indicators: [],
    });
  }
  alerts.sort((a, b) => rank(b.level) - rank(a.level));

  // System roll-up
  const systems = {} as Record<SystemId, SystemAssessment>;
  for (const sid of SYSTEM_IDS) systems[sid] = { system: sid, level: 'nominal', reasons: [], alertIds: [] };
  for (const a of Object.values(assessments)) {
    if (!a || a.level === 'nominal') continue;
    for (const sid of INDICATORS[a.indicator].systems) {
      systems[sid].level = maxLevel(systems[sid].level, a.level);
      systems[sid].reasons.push(...a.reasons);
    }
  }
  for (const al of alerts) {
    for (const sid of al.systems) {
      systems[sid].level = maxLevel(systems[sid].level, al.level);
      systems[sid].alertIds.push(al.id);
      if (!systems[sid].reasons.includes(al.title)) systems[sid].reasons.unshift(al.title);
    }
  }

  const overall = maxLevel(...Object.values(systems).map((s) => s.level));
  const recentDays = new Set(own.filter((c) => c.day > day - 7 && c.day <= day).map((c) => c.day));
  const sleep7 = window(ctx, 'sleepHours', 7).map((p) => p.value);
  const res7 = window(ctx, 'exerciseResistive', 7).map((p) => p.value);
  const readiness = readinessScore(systems, {
    checkInDaysLast7: recentDays.size,
    sleepAvg: sleep7.length ? mean(sleep7) : undefined,
    exerciseAdherence: res7.length ? Math.min(1, mean(res7) / RULES.resistiveTargetMin) : undefined,
  });

  return { crewId: input.crewId, day, overall, indicators: assessments, systems, alerts, readiness };
}
