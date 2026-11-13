import type { EnvironmentId, MissionEnvironment } from '@/types';

/**
 * Mission environments. Dose figures:
 *  - ISS: ~0.3–0.8 mSv/day (NASA HRP Evidence Report: Space Radiation, 2016)
 *  - Lunar surface: ~1.37 mSv/day (Zhang et al., Science Advances 2020, Chang'e-4 LND)
 *  - Mars transit: ~1.84 mSv/day (Zeitlin et al., Science 2013, MSL RAD cruise)
 *  - Mars surface: ~0.64 mSv/day (Hassler et al., Science 2014, MSL RAD)
 */
export const ENVIRONMENTS: Record<EnvironmentId, MissionEnvironment> = {
  iss: {
    id: 'iss',
    name: 'International Space Station',
    short: 'ISS · LEO',
    gravityG: 0,
    delayLabel: '< 1 s',
    radiationLevel: 'low',
    baselineDoseMsvPerDay: 0.5,
    resupply: 'Regular cargo every 1–3 months; crew return possible within hours.',
    emphasizedSystems: ['musculoskeletal', 'sans', 'cardio'],
    emphasizedHazards: ['gravity', 'environment'],
    description: 'Low Earth orbit, protected by the magnetosphere. Ground support is real-time.',
  },
  gateway: {
    id: 'gateway',
    name: 'Lunar Gateway',
    short: 'Gateway · NRHO',
    gravityG: 0,
    delayLabel: '~1.3 s',
    radiationLevel: 'high',
    baselineDoseMsvPerDay: 1.4,
    resupply: 'Logistics modules per Artemis campaign; return to Earth ~3–5 days.',
    emphasizedSystems: ['musculoskeletal', 'sans', 'immune'],
    emphasizedHazards: ['radiation', 'gravity', 'isolation'],
    description: 'Near-rectilinear halo orbit outside the magnetosphere. Solar particle events are a key risk.',
  },
  'lunar-surface': {
    id: 'lunar-surface',
    name: 'Lunar Surface Base',
    short: 'Moon · 0.16 g',
    gravityG: 0.16,
    delayLabel: '~1.3 s',
    radiationLevel: 'high',
    baselineDoseMsvPerDay: 1.37,
    resupply: 'Infrequent landers; return to Earth ~4–6 days.',
    emphasizedSystems: ['lungs', 'skin', 'musculoskeletal'],
    emphasizedHazards: ['radiation', 'environment', 'gravity'],
    description: 'Partial gravity, abrasive lunar dust, long EVAs, high radiation.',
  },
  'mars-transit': {
    id: 'mars-transit',
    name: 'Mars Transit',
    short: 'Mars Transit · 0 g',
    gravityG: 0,
    delayLabel: '4–22 min (grows with distance)',
    radiationLevel: 'very-high',
    baselineDoseMsvPerDay: 1.84,
    resupply: 'None. Everything aboard must last the mission.',
    emphasizedSystems: ['behavioral', 'musculoskeletal', 'sans', 'immune'],
    emphasizedHazards: ['distance', 'radiation', 'isolation', 'gravity'],
    description: 'Deep space, no resupply, no quick return. Autonomous medical care is essential.',
  },
  'mars-surface': {
    id: 'mars-surface',
    name: 'Mars Surface Base',
    short: 'Mars · 0.38 g',
    gravityG: 0.38,
    delayLabel: '4–22 min',
    radiationLevel: 'moderate',
    baselineDoseMsvPerDay: 0.64,
    resupply: 'None; return window every ~26 months.',
    emphasizedSystems: ['cardio', 'musculoskeletal', 'behavioral', 'lungs'],
    emphasizedHazards: ['distance', 'gravity', 'isolation', 'environment'],
    description: 'Partial gravity after months in 0 g; orthostatic intolerance and dust exposure risks.',
  },
  rover: {
    id: 'rover',
    name: 'Pressurized Rover',
    short: 'Rover · Excursion',
    gravityG: 0.16,
    delayLabel: '~1.3 s (lunar) to 22 min (Mars)',
    radiationLevel: 'high',
    baselineDoseMsvPerDay: 1.2,
    resupply: 'Limited to rover consumables; return to base in hours to days.',
    emphasizedSystems: ['behavioral', 'musculoskeletal', 'skin'],
    emphasizedHazards: ['environment', 'isolation', 'radiation'],
    description: 'Very small habitable volume, high workload, CO₂ and thermal control limits.',
  },
};

export const ENVIRONMENT_LIST: MissionEnvironment[] = Object.values(ENVIRONMENTS);

/**
 * Simulated one-way communication delay (seconds) for a given mission day.
 * Mars values follow the 4–22 min light-time range; transit delay grows with distance.
 */
export function commDelaySeconds(env: EnvironmentId, day: number): number {
  switch (env) {
    case 'iss':
      return 0.5;
    case 'gateway':
    case 'lunar-surface':
      return 1.3;
    case 'rover':
      return 1.3;
    case 'mars-transit': {
      // 210-day transit; light time rises from ~4 min toward ~20 min.
      const frac = Math.min(1, Math.max(0, day / 210));
      return Math.round((4 + 16 * Math.pow(frac, 0.8)) * 60);
    }
    case 'mars-surface': {
      // Synodic cycle (~780 days) between 4 and 22 minutes.
      const minutes = 13 - 9 * Math.cos((2 * Math.PI * day) / 780);
      return Math.round(minutes * 60);
    }
  }
}

export function formatDelay(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m} min ${s} s` : `${m} min`;
}
