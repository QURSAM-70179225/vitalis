/**
 * VITALIS triage thresholds — the single editable source of truth.
 *
 * ⚠️ MEDICAL DISCLAIMER: VITALIS provides decision support, NOT diagnosis.
 * These values are general adult reference ranges compiled for a hackathon
 * prototype. A real mission would use crew-specific values set by the flight
 * surgeon. Every value can be overridden in Settings → Thresholds.
 *
 * Band semantics: a value at or beyond a bound receives that level (inclusive).
 * Where a guideline says "≥ X is normal" the bound sits just below X
 * (e.g. sleep monLow 6.75 so that 7 h is nominal).
 *   critLow < actLow < monLow  [nominal]  monHigh < actHigh < critHigh
 *
 * Modes:
 *   absolute        — bands are in the indicator's own unit
 *   relativeToStart — bands are % change vs. the crew member's mission-start mean (first 7 readings)
 *   envScaled       — bands are multiples of the mission environment's typical daily dose
 */
import type { IndicatorId, ThresholdBands } from '@/types';

export type ThresholdMode = 'absolute' | 'relativeToStart' | 'envScaled';

export interface ThresholdConfig {
  bands: ThresholdBands;
  mode: ThresholdMode;
  /** Which direction of personal-baseline deviation is concerning. */
  worse: 'high' | 'low' | 'both';
  /** Apply the personal-baseline (z-score) layer. */
  baseline: boolean;
  /** SD floor so tiny natural variance doesn't explode z-scores. */
  minSd: number;
  source: string;
}

export const THRESHOLDS: Record<IndicatorId, ThresholdConfig> = {
  heartRate: {
    // Source: AHA resting HR 60–100 bpm; trained-athlete bradycardia to ~40–50 is common.
    // Tachycardia >130 at rest treated as emergency per ACLS guidance.
    bands: { critLow: 35, actLow: 40, monLow: 45, monHigh: 100, actHigh: 115, critHigh: 130 },
    mode: 'absolute',
    worse: 'both',
    baseline: true,
    minSd: 3,
    source: 'AHA resting heart rate guidance; ACLS tachycardia/bradycardia algorithms',
  },
  systolic: {
    // Source: 2017 ACC/AHA Hypertension Guideline (elevated 120–129, stage 1 130–139,
    // stage 2 ≥140, crisis ≥180). Hypotension <90 relevant to orthostatic intolerance (NASA HRP CV risk).
    bands: { critLow: 80, actLow: 90, monLow: 95, monHigh: 130, actHigh: 140, critHigh: 180 },
    mode: 'absolute',
    worse: 'both',
    baseline: true,
    minSd: 4,
    source: '2017 ACC/AHA Hypertension Guideline; NASA HRP Cardiovascular risk evidence',
  },
  diastolic: {
    // Source: 2017 ACC/AHA (stage 1 80–89, stage 2 ≥90, crisis ≥120).
    bands: { critLow: 45, actLow: 50, monLow: 55, monHigh: 85, actHigh: 90, critHigh: 120 },
    mode: 'absolute',
    worse: 'both',
    baseline: true,
    minSd: 3,
    source: '2017 ACC/AHA Hypertension Guideline',
  },
  spo2: {
    // Source: WHO Pulse Oximetry Training Manual (normal ≥95%; <90% needs urgent treatment);
    // NASA-STD-3001 Vol 2 atmosphere / hypoxia limits.
    bands: { critLow: 88, actLow: 91, monLow: 94 },
    mode: 'absolute',
    worse: 'low',
    baseline: true,
    minSd: 0.8,
    source: 'WHO Pulse Oximetry Training Manual (2011); NASA-STD-3001 Vol. 2',
  },
  temperature: {
    // Source: Clinical fever ≥38.0 °C (IDSA); hyperpyrexia ≥39.5 °C urgent. Core temperature runs
    // ~1 °C higher in long-duration flight (Stahn et al., Sci Rep 2017), so monitor from 37.5.
    bands: { critLow: 34.5, actLow: 35.0, monLow: 35.8, monHigh: 37.5, actHigh: 38.0, critHigh: 39.5 },
    mode: 'absolute',
    worse: 'high',
    baseline: true,
    minSd: 0.2,
    source: 'IDSA fever definition; Stahn et al. 2017 (core temperature in spaceflight)',
  },
  glucose: {
    // Source: ADA Standards of Care 2024 — fasting 70–99 normal, 100–125 prediabetes,
    // <70 level-1 hypoglycemia, <54 level-2 (clinically significant).
    bands: { critLow: 54, actLow: 70, monLow: 72, monHigh: 100, actHigh: 180, critHigh: 250 },
    mode: 'absolute',
    worse: 'both',
    baseline: true,
    minSd: 5,
    source: 'American Diabetes Association Standards of Care (2024)',
  },
  respRate: {
    // Source: Adult normal 12–20/min; ≥25 is a sepsis/early-warning trigger (NEWS2, RCP 2017).
    bands: { critLow: 8, actLow: 10, monLow: 11, monHigh: 21, actHigh: 25, critHigh: 30 },
    mode: 'absolute',
    worse: 'both',
    baseline: true,
    minSd: 1.5,
    source: 'Royal College of Physicians NEWS2 (2017)',
  },
  sleepHours: {
    // Source: AASM/SRS adult consensus ≥7 h; Barger et al., Lancet Neurol 2014 (ISS crews average ~6 h).
    bands: { critLow: 3, actLow: 5.5, monLow: 6.75 },
    mode: 'absolute',
    worse: 'low',
    baseline: true,
    minSd: 0.5,
    source: 'AASM/SRS consensus (Watson et al. 2015); Barger et al. 2014',
  },
  sleepQuality: {
    // Source: VITALIS self-report scale (1–5). ≤2 = poor (aligned with PSQI "fairly/very bad").
    bands: { actLow: 1, monLow: 2 },
    mode: 'absolute',
    worse: 'low',
    baseline: true,
    minSd: 0.6,
    source: 'Self-report scale adapted from PSQI subjective sleep quality item',
  },
  mood: {
    // Source: VITALIS 5-point mood scale; 1 = very low triggers action (BHP screening practice).
    bands: { actLow: 1, monLow: 2 },
    mode: 'absolute',
    worse: 'low',
    baseline: true,
    minSd: 0.6,
    source: 'NASA Behavioral Health & Performance self-report practice (adapted)',
  },
  stress: {
    // Source: VITALIS 5-point scale; 4 = high, 5 = overwhelmed.
    bands: { monHigh: 4, actHigh: 5 },
    mode: 'absolute',
    worse: 'high',
    baseline: true,
    minSd: 0.6,
    source: 'Adapted from Perceived Stress single-item measures',
  },
  fatigue: {
    // Source: VITALIS 5-point scale, adapted from the Samn-Perelli fatigue checklist used in aviation and NASA ops.
    bands: { monHigh: 4, actHigh: 5 },
    mode: 'absolute',
    worse: 'high',
    baseline: true,
    minSd: 0.6,
    source: 'Samn-Perelli fatigue scale (adapted)',
  },
  bodyMass: {
    // Source: NASA nutrition requirements (Smith & Zwart) — maintain within 2% of pre-flight mass;
    // >5% loss is clinically significant, >10% severe. Values are % change from mission start.
    bands: { critLow: -10, actLow: -5, monLow: -2, monHigh: 5, actHigh: 8 },
    mode: 'relativeToStart',
    worse: 'low',
    baseline: false,
    minSd: 0.3,
    source: 'Smith SM, Zwart SR et al. Nutritional Biochemistry of Space Flight; NASA-STD-3001 Vol. 1',
  },
  hydration: {
    // Source: NASA ISS nutritional requirement ≥2,000 mL/day fluid (SSP 50005); kidney stone
    // prevention guidance (HRP Renal Stone risk) recommends ≥2.5 L urine output.
    bands: { critLow: 800, actLow: 1500, monLow: 1950 },
    mode: 'absolute',
    worse: 'low',
    baseline: false,
    minSd: 150,
    source: 'NASA SSP 50005 crew nutrition; HRP Risk of Renal Stone Formation',
  },
  exerciseResistive: {
    // Source: ISS exercise prescription ~1 h ARED resistive, 6 d/wk (Loehr et al., Aerosp Med Hum Perform 2015).
    // A single low day is only "monitor"; sustained under-loading is caught by the bone-loss rule.
    bands: { monLow: 20 },
    mode: 'absolute',
    worse: 'low',
    baseline: false,
    minSd: 5,
    source: 'Loehr et al. 2015 — ISS physical training and countermeasures',
  },
  exerciseAerobic: {
    // Source: ISS aerobic prescription ~30–45 min/day on T2 treadmill or CEVIS cycle.
    bands: { monLow: 15 },
    mode: 'absolute',
    worse: 'low',
    baseline: false,
    minSd: 5,
    source: 'Loehr et al. 2015; Ploutz-Snyder et al. 2018 (SPRINT protocol)',
  },
  radiationDose: {
    // Source: Bands are multiples of the environment's typical daily dose. NASA-STD-3001 Rev B (2022)
    // career limit 600 mSv; 30-day BFO limit 250 mGy-Eq. A >4× spike indicates a probable SPE.
    bands: { monHigh: 2, actHigh: 4, critHigh: 8 },
    mode: 'envScaled',
    worse: 'high',
    baseline: false,
    minSd: 0.1,
    source: 'NASA-STD-3001 Vol. 1 Rev B (2022) radiation limits; NOAA SWPC S-scale',
  },
  reactionTime: {
    // Source: PVT literature (Basner & Dinges, Sleep 2011): well-rested mean RT ~230–300 ms.
    bands: { monHigh: 320, actHigh: 380, critHigh: 500 },
    mode: 'absolute',
    worse: 'high',
    baseline: true,
    minSd: 12,
    source: 'Basner M, Dinges DF. Sleep 2011 — PVT metrics',
  },
  pvtLapses: {
    // Source: Basner & Dinges 2011 — lapses (RT ≥500 ms) are the most sensitive sleep-loss marker.
    bands: { monHigh: 3, actHigh: 6, critHigh: 12 },
    mode: 'absolute',
    worse: 'high',
    baseline: false,
    minSd: 1,
    source: 'Basner M, Dinges DF. Sleep 2011',
  },
};

/** Personal-baseline parameters. */
export const BASELINE = {
  /** Rolling window (readings) for the personal baseline. */
  windowDays: 14,
  /** Minimum readings before the baseline layer is trusted. */
  minReadings: 7,
  /** |z| above this flags a single reading. */
  zFlag: 2,
  /** |z| above this (with sustained trend) escalates to "act". */
  zAct: 3,
  /** Consecutive readings that must all deviate in the same direction to count as a trend. */
  sustainedDays: 3,
  /** Each reading in a sustained trend must exceed this |z|. */
  sustainedZ: 1.5,
} as const;

/** Combination-rule parameters. */
export const RULES = {
  resistiveTargetMin: 45,
  aerobicTargetMin: 30,
  boneAdherenceAct: 0.6,
  behavioralDays: 3,
  behavioralContactDays: 5,
  sleepDebtNights: 3,
  sleepDebtHours: 6,
  lowHydrationDays: 3,
  feverForInfection: 37.8,
  /** Cumulative-dose fraction of NASA career limit (600 mSv) that triggers monitor. */
  careerLimitMsv: 600,
  careerMonitorFraction: 0.5,
} as const;

export const DISCLAIMER =
  'VITALIS is decision support, not a diagnosis. It never replaces your Crew Medical Officer or flight surgeon. If in doubt, escalate.';

/** Merge user overrides (Settings) on top of defaults. */
export function resolveThresholds(
  overrides: Partial<Record<IndicatorId, Partial<ThresholdBands>>> = {},
): Record<IndicatorId, ThresholdConfig> {
  const out = { ...THRESHOLDS };
  for (const key of Object.keys(overrides) as IndicatorId[]) {
    const o = overrides[key];
    if (o) out[key] = { ...out[key], bands: { ...out[key].bands, ...o } };
  }
  return out;
}
