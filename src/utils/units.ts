import type { IndicatorId, UnitPrefs } from '@/types';
import { INDICATORS } from '@/data/indicators';

/** Convert a canonical (metric) value to the user's display unit. */
export function toDisplay(id: IndicatorId, v: number, u: UnitPrefs): number {
  if (id === 'temperature' && u.temperature === 'F') return v * 1.8 + 32;
  if (id === 'bodyMass' && u.mass === 'lb') return v * 2.20462;
  if (id === 'glucose' && u.glucose === 'mmol/L') return v / 18.016;
  return v;
}

/** Convert a display-unit value back to canonical metric. */
export function fromDisplay(id: IndicatorId, v: number, u: UnitPrefs): number {
  if (id === 'temperature' && u.temperature === 'F') return (v - 32) / 1.8;
  if (id === 'bodyMass' && u.mass === 'lb') return v / 2.20462;
  if (id === 'glucose' && u.glucose === 'mmol/L') return v * 18.016;
  return v;
}

export function unitLabel(id: IndicatorId, u: UnitPrefs): string {
  if (id === 'temperature') return `°${u.temperature}`;
  if (id === 'bodyMass') return u.mass;
  if (id === 'glucose') return u.glucose;
  return INDICATORS[id].unit;
}

export function displayDigits(id: IndicatorId, u: UnitPrefs): number {
  if (id === 'glucose' && u.glucose === 'mmol/L') return 1;
  if (id === 'radiationDose') return 2;
  const step = INDICATORS[id].step;
  return step < 1 ? 1 : 0;
}

export function formatValue(id: IndicatorId, v: number | undefined, u: UnitPrefs, withUnit = true): string {
  if (v === undefined || Number.isNaN(v)) return '—';
  const d = toDisplay(id, v, u);
  const s = d.toFixed(displayDigits(id, u));
  const unit = unitLabel(id, u);
  return withUnit && unit ? `${s} ${unit}` : s;
}

/** Input range in display units. */
export function displayRange(id: IndicatorId, u: UnitPrefs): { min: number; max: number; step: number } {
  const m = INDICATORS[id];
  const a = toDisplay(id, m.min, u);
  const b = toDisplay(id, m.max, u);
  let step = m.step;
  if (id === 'glucose' && u.glucose === 'mmol/L') step = 0.1;
  if (id === 'bodyMass' && u.mass === 'lb') step = 0.2;
  return { min: Math.floor(Math.min(a, b)), max: Math.ceil(Math.max(a, b)), step };
}
