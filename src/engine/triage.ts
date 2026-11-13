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

const fmt = (v: number, digits = 0) => v.toFixed(digits).replace(/\.0+$/, '');

function digitsFor(id: IndicatorId): number {
  const step = INDICATORS[id].step;
  return step < 0.1 ? 2 : step < 1 ? 1 : 0;
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
      reasons.push(`${meta.label} ${bv >= 0 ? 'up' : 'down'} ${fmt(Math.abs(bv), 1)}% since mission start (limit ${fmt(Math.abs(abs.bound))}%)`);
    } else if (cfg.mode === 'envScaled') {
      reasons.push(
        `${meta.label} ${fmt(last.value, 2)} ${meta.unit} is ${fmt(bv, 1)}× the typical ${env.short} level (${fmt(env.baselineDoseMsvPerDay, 2)} ${meta.unit}/day)`,
      );
    } else {
      reasons.push(
        `${meta.label} ${fmt(last.value, d)} ${meta.unit} is ${abs.dir === 'high' ? 'at or above' : 'at or below'} the threshold of ${fmt(abs.bound, d)}`,
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
        `${meta.label} ${fmt(Math.abs(pct), 0)}% ${sustained === 'high' ? 'above' : 'below'} your personal baseline for ${days} days (baseline ${fmt(baseline.mean, d)} ${meta.unit})`,
      );
    } else if (zFlag) {
      reasons.push(
        `${meta.label} is ${fmt(Math.abs(z), 1)} SD ${zDir === 'high' ? 'above' : 'below'} your personal baseline (${fmt(baseline.mean, d)} ± ${fmt(baseline.sd, d || 1)} ${meta.unit})`,
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
    title: 'Radiation spike: Solar Particle Event protocol',
    why: [
      `Dosimeter read ${fmt(v, 2)} mSv in 24 h, ${fmt(ratio, 1)}× the typical ${ctx.env.short} level`,
      'A sudden jump like this usually means a solar particle event (SPE)',
    ],
    systems: ['immune', 'skin', 'sans'],
    hazards: ['radiation', 'distance'],
    guidanceIds: ['radiation-shelter'],
    actions: [
      'Move to the storm shelter (the most shielded area, such as water-wall crew quarters) now',
      'Keep your active dosimeter on your chest and log the readings every 30 minutes',
      'Stay sheltered until the all-clear: dose rate back below 2× typical',
      'Postpone any EVA',
      'Drink fluids and report any nausea, vomiting or fatigue',
    ],
    escalateWhen: 'Nausea or vomiting within hours of exposure, or cumulative event dose above 100 mSv.',
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
    title: 'Cumulative radiation dose approaching career limit',
    why: [`Mission dose ${fmt(total, 0)} mSv = ${fmt(frac * 100, 0)}% of the NASA 600 mSv career limit`],
    systems: ['immune'],
    hazards: ['radiation'],
    guidanceIds: ['radiation-shelter'],
    actions: ['Sleep and spend off-duty time in the most shielded areas', 'Review EVA plans with the flight surgeon'],
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
    title: 'Behavioral health alert: sleep, mood and stress pattern',
    why: [
      `Poor sleep + low mood + high stress together on ${last5} of the last 5 days`,
      ...(badDays.length >= RULES.behavioralContactDays ? [`Pattern present on ${badDays.length} of the last 7 days`] : []),
      'Isolation and distance from home are known contributors on long missions',
    ],
    systems: ['behavioral'],
    hazards: ['isolation', 'distance'],
    guidanceIds: ['breathing', 'sleep-hygiene', 'connect-home', 'workload'],
    actions: [
      'Do the 4-7-8 breathing exercise now (2 minutes)',
      'Tell your Crew Medical Officer how you have been feeling',
      'Schedule a private family or psychological conference (PFC/PPC)',
      'Ask the crew to review your workload and keep a protected sleep window tonight',
    ],
    escalateWhen: 'Any thoughts of self-harm, or you cannot perform critical tasks. Tell your CMO immediately.',
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
    if (sys.pctFromBaseline !== null) why.push(`Systolic BP ${fmt(sys.value)} mmHg, ${fmt(sys.pctFromBaseline, 0)}% above your baseline`);
    else why.push(`Systolic BP ${fmt(sys.value)} mmHg`);
    if (sysSlope >= 0.8) why.push(`Rising about ${fmt(sysSlope, 1)} mmHg/day over the past week`);
  }
  if (headache) why.push('Headache reported in the last 3 days');
  if (vision) why.push('Vision change reported in the last 3 days');

  let level: StatusLevel | null = null;
  let title = '';
  if (bpRising && headache && vision) {
    level = 'critical';
    title = 'SANS / cardiovascular check: rising BP + headache + vision change';
  } else if (vision) {
    level = 'act';
    title = 'Vision change: SANS eye check needed';
  } else if (bpRising && headache) {
    level = 'monitor';
    title = 'Rising blood pressure with headache';
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
      'Do the Amsler grid and near-vision chart test in the Guidance library and log the results',
      'Recheck blood pressure in 15 minutes, seated and relaxed, then twice daily',
      'Check the cabin CO₂ reading. If it is above 3 mmHg, ask the crew to increase scrubbing',
      'Schedule an onboard eye exam (fundoscopy / OCT) with the CMO',
      'Avoid heavy resistive exercise and Valsalva straining until reviewed',
    ],
    escalateWhen: 'Sudden vision loss, a severe headache, or BP at or above 180/120. This is an emergency.',
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
    title: massDown ? 'Bone & muscle loss risk: low loading and mass decline' : 'Resistive exercise below target',
    why: [
      `Resistive exercise averaged ${fmt(avg)} min/day over 7 days (${fmt(adherence * 100)}% of the ${RULES.resistiveTargetMin}-min target)`,
      ...(massDown ? [`Body mass down ${fmt(Math.abs(massPct), 1)}% since mission start`] : []),
      'Weight-bearing bones can lose 1–1.5% of their mineral density per month without loading',
    ],
    systems: ['musculoskeletal'],
    hazards: ['gravity'],
    guidanceIds: ['resistive', 'nutrition-bone', 'aerobic'],
    actions: [
      'Return to the full resistive protocol: squat, deadlift and heel raise at prescribed loads',
      'Ask the crew to protect your exercise block on the schedule',
      'Eat your full calorie and protein ration, and take your vitamin D if prescribed',
      'Measure body mass on the SLAMMD weekly',
    ],
    escalateWhen: 'Body mass loss over 5%, or sudden back or flank pain.',
    indicators: ['exerciseResistive', 'bodyMass'],
  };
};

const infection: Rule = (ctx) => {
  const t = valueOn(ctx.series.temperature, ctx.day);
  if (t === undefined || t < RULES.feverForInfection) return null;
  const supporting: string[] = [];
  if (hadSymptom(ctx, 'congestion', 2)) supporting.push('nasal congestion');
  if (hadSymptom(ctx, 'fever', 2)) supporting.push('chills / feeling feverish');
  const fatigue = valueOn(ctx.series.fatigue, ctx.day);
  if (fatigue !== undefined && fatigue >= 4) supporting.push('high fatigue');
  const rr = valueOn(ctx.series.respRate, ctx.day);
  if (rr !== undefined && rr >= 21) supporting.push(`breathing rate ${rr}/min`);
  if (!supporting.length) return null;
  return {
    id: 'infection',
    ruleId: 'possible-infection',
    level: t >= (ctx.thresholds.temperature.bands.critHigh ?? 39.5) ? 'critical' : 'act',
    title: 'Possible infection',
    why: [`Temperature ${fmt(t, 1)} °C with ${supporting.join(', ')}`],
    systems: ['immune', 'lungs'],
    hazards: ['environment', 'isolation'],
    guidanceIds: ['infection', 'hydration'],
    actions: [
      'Recheck your temperature in 4 hours',
      'Wear a mask in shared modules and wipe down shared surfaces',
      'Drink at least 2.5 L of fluids today and rest',
      'Ask the CMO about the onboard medical kit (antipyretic per protocol)',
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
    title: back ? 'Kidney stone warning: low fluids + back pain' : 'Low fluid intake: kidney stone risk',
    why: [
      `Fluid intake below 2,000 mL for ${lowDays} days in a row (latest ${fmt(hyd[hyd.length - 1].value)} mL)`,
      ...(back ? ['Back or flank pain reported'] : []),
      'Bone calcium released in microgravity plus low fluid raises kidney stone risk',
    ],
    systems: ['gi', 'musculoskeletal'],
    hazards: ['gravity', 'distance'],
    guidanceIds: ['hydration'],
    actions: ['Drink one 250 mL bag every hour while awake today (target 2.5–3 L)', 'Note your urine colour. It should be pale.'],
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
    title: chest ? 'Chest pain: treat as an emergency' : 'Low oxygen with shortness of breath',
    why: [
      ...(chest ? ['Chest pain or pressure reported today'] : []),
      ...(hypoxic ? [`SpO₂ ${spo2}% with shortness of breath`] : []),
    ],
    systems: ['cardio', 'lungs'],
    hazards: ['distance', 'environment'],
    guidanceIds: ['emergency-cardio'],
    actions: [
      'Stop all activity and alert the crew now',
      'CMO: attach the ECG / monitor and record vitals every 5 minutes',
      'Put on the oxygen mask if SpO₂ is below 92%',
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
    title: 'Sleep debt: fatigue risk for critical tasks',
    why: [
      `Under ${RULES.sleepDebtHours} h sleep for ${nights.length} nights in a row (≈${fmt(debt, 1)} h debt vs 8 h)`,
      ...(rt && rt.level !== 'nominal' ? [`Reaction time is also slowed (${fmt(rt.value)} ms)`] : []),
    ],
    systems: ['behavioral'],
    hazards: ['isolation', 'environment'],
    guidanceIds: ['sleep-hygiene', 'workload'],
    actions: [
      'Protect an 8.5-hour sleep window tonight. Ask for a schedule shift if needed.',
      'Use the circadian lighting "pre-sleep" mode for 2 h before bed',
      'Avoid caffeine within 6 h of sleep',
      'Avoid scheduling EVA, docking or robotics until rested',
    ],
    escalateWhen: 'Microsleeps during critical tasks, or no improvement after 3 recovery nights.',
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
    title: 'Nausea: possible space motion sickness',
    why: ['Nausea reported today', ...(dizzy ? ['Dizziness reported too'] : [])],
    systems: ['gi'],
    hazards: ['gravity'],
    guidanceIds: ['motion-sickness', 'hydration'],
    actions: ['Keep your head still and align your body with the local "up"', 'Take small sips of fluid', 'Ask the CMO about anti-nausea medication per protocol'],
    escalateWhen: 'Vomiting for more than 24 h, or nausea after a radiation spike.',
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
    actions: ['Sit or lie down before standing slowly', 'Drink 1 L of fluid with electrolytes (fluid loading)', 'Wear compression garments'],
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
        ? `${meta.label}: abnormal for you`
        : `${meta.label} ${a.absoluteLevel === 'critical' ? 'critical' : 'out of range'}`,
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
