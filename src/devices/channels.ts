/**
 * Live sensor channels and their real-time alarm bands.
 *
 * ⚠️ Prototype values. Suit limits are approximations of published xEMU/EMU
 * figures and NASA-STD-3001 Vol. 2. A flight program would use the suit
 * vendor's certified caution & warning limits.
 */
import type { ChannelId, IndicatorId, ThresholdBands } from '@/types';

export interface ChannelMeta {
  id: ChannelId;
  label: string;
  short: string;
  unit: string;
  digits: number;
  /** Plausible physical range; values outside are discarded as sensor errors. */
  range: [number, number];
  bands: ThresholdBands;
  /** Daily check-in indicator this channel can fill in automatically. */
  indicator?: IndicatorId;
  suit?: boolean;
  source: string;
}

export const CHANNELS: Record<ChannelId, ChannelMeta> = {
  hr: { id: 'hr', label: 'Heart rate', short: 'HR', unit: 'bpm', digits: 0, range: [25, 240], bands: { critLow: 35, actLow: 40, monHigh: 150, actHigh: 170, critHigh: 190 }, indicator: 'heartRate', source: 'Exercise/EVA ranges; ACLS bradycardia' },
  hrv: { id: 'hrv', label: 'Heart-rate variability (RMSSD)', short: 'HRV', unit: 'ms', digits: 0, range: [2, 300], bands: { monLow: 15 }, source: 'Shaffer & Ginsberg 2017' },
  spo2: { id: 'spo2', label: 'Blood oxygen', short: 'SpO₂', unit: '%', digits: 0, range: [50, 100], bands: { critLow: 88, actLow: 91, monLow: 94 }, indicator: 'spo2', source: 'WHO pulse oximetry manual' },
  temp: { id: 'temp', label: 'Body temperature', short: 'Temp', unit: '°C', digits: 1, range: [30, 43], bands: { critLow: 35, actLow: 35.5, monHigh: 37.8, actHigh: 38.5, critHigh: 39.5 }, indicator: 'temperature', source: 'IDSA; EVA thermal load' },
  resp: { id: 'resp', label: 'Breathing rate', short: 'RR', unit: '/min', digits: 0, range: [3, 70], bands: { critLow: 8, actLow: 10, monHigh: 28, actHigh: 32, critHigh: 40 }, indicator: 'respRate', source: 'NEWS2 (exercise-adjusted)' },
  sys: { id: 'sys', label: 'Systolic BP', short: 'SYS', unit: 'mmHg', digits: 0, range: [50, 260], bands: { critLow: 80, actLow: 90, monHigh: 140, actHigh: 160, critHigh: 180 }, indicator: 'systolic', source: 'ACC/AHA 2017' },
  dia: { id: 'dia', label: 'Diastolic BP', short: 'DIA', unit: 'mmHg', digits: 0, range: [25, 160], bands: { critLow: 45, monHigh: 90, actHigh: 100, critHigh: 120 }, indicator: 'diastolic', source: 'ACC/AHA 2017' },
  mass: { id: 'mass', label: 'Body mass', short: 'Mass', unit: 'kg', digits: 1, range: [30, 200], bands: {}, indicator: 'bodyMass', source: 'SLAMMD / scale' },
  suitPressure: { id: 'suitPressure', label: 'Suit pressure', short: 'Suit P', unit: 'kPa', digits: 1, range: [0, 60], bands: { critLow: 25, actLow: 27, monLow: 28.5 }, suit: true, source: 'xEMU nominal ~29.6 kPa (4.3 psi)' },
  suitCo2: { id: 'suitCo2', label: 'Suit CO₂', short: 'CO₂', unit: 'mmHg', digits: 1, range: [0, 60], bands: { monHigh: 4, actHigh: 8, critHigh: 15 }, suit: true, source: 'NASA-STD-3001 Vol. 2 (approx.)' },
  o2: { id: 'o2', label: 'O₂ remaining', short: 'O₂', unit: '%', digits: 0, range: [0, 100], bands: { critLow: 10, actLow: 20, monLow: 30 }, suit: true, source: 'EVA consumables margin (approx.)' },
  doseRate: { id: 'doseRate', label: 'Dose rate', short: 'Dose', unit: 'µSv/h', digits: 0, range: [0, 100000], bands: { monHigh: 250, actHigh: 1000, critHigh: 5000 }, source: 'Deep-space GCR ~75 µSv/h; SPE onset ≫ background' },
};

export const CHANNEL_IDS = Object.keys(CHANNELS) as ChannelId[];
export const BODY_CHANNELS = CHANNEL_IDS.filter((c) => !CHANNELS[c].suit);
export const SUIT_CHANNELS = CHANNEL_IDS.filter((c) => CHANNELS[c].suit);

/** Root mean square of successive differences of RR intervals (ms). */
export function rmssd(rr: number[]): number | null {
  if (rr.length < 3) return null;
  let s = 0;
  for (let i = 1; i < rr.length; i++) s += (rr[i] - rr[i - 1]) ** 2;
  return Math.sqrt(s / (rr.length - 1));
}
