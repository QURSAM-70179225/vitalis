/**
 * VITALIS open telemetry protocol (JSON lines) for suits, wearables and
 * sensor boards over USB serial or WebSocket. One JSON object per line, e.g.
 *
 *   {"hr":92,"spo2":97,"temp":37.1,"resp":18,"suitPressure":29.5,"suitCo2":3.2,"o2":78,"doseRate":80}
 *
 * Unknown keys are ignored; out-of-range values are dropped as sensor errors.
 * See docs/SENSORS.md.
 */
import type { ChannelId, ChannelValues } from '@/types';
import { CHANNELS } from './channels';

const ALIASES: Record<string, ChannelId> = {
  hr: 'hr',
  heartrate: 'hr',
  heart_rate: 'hr',
  pulse: 'hr',
  hrv: 'hrv',
  rmssd: 'hrv',
  spo2: 'spo2',
  sao2: 'spo2',
  temp: 'temp',
  bodytemp: 'temp',
  body_temp: 'temp',
  coretemp: 'temp',
  resp: 'resp',
  rr: 'resp',
  resprate: 'resp',
  breathing: 'resp',
  sys: 'sys',
  systolic: 'sys',
  dia: 'dia',
  diastolic: 'dia',
  mass: 'mass',
  weight: 'mass',
  suitpressure: 'suitPressure',
  suit_pressure: 'suitPressure',
  suit_kpa: 'suitPressure',
  suitco2: 'suitCo2',
  suit_co2: 'suitCo2',
  co2: 'suitCo2',
  ppco2: 'suitCo2',
  o2: 'o2',
  o2remaining: 'o2',
  o2_remaining: 'o2',
  doserate: 'doseRate',
  dose_rate: 'doseRate',
  dose: 'doseRate',
};

export function parseFrame(input: unknown): ChannelValues | null {
  let obj: unknown = input;
  if (typeof input === 'string') {
    const line = input.trim();
    if (!line.startsWith('{')) return null;
    try {
      obj = JSON.parse(line);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out: ChannelValues = {};
  for (const [k, raw] of Object.entries(obj as Record<string, unknown>)) {
    const id = ALIASES[k.toLowerCase()];
    if (!id) continue;
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    const [lo, hi] = CHANNELS[id].range;
    if (Number.isFinite(v) && v >= lo && v <= hi) out[id] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Splits a streaming text buffer into complete lines, returning the leftover. */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? '';
  return { lines: parts.filter((l) => l.trim()), rest };
}
