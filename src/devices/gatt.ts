/**
 * Parsers for standard Bluetooth SIG health profiles (GATT). These are the
 * formats used by off-the-shelf chest straps, pulse oximeters, BP cuffs,
 * thermometers and scales, so any compliant device works.
 */

/** IEEE-11073 16-bit SFLOAT. */
export function sfloat(raw: number): number {
  const m = raw & 0x0fff;
  const e = raw >> 12;
  if (m === 0x07ff || m === 0x0800 || m === 0x07fe || m === 0x0802 || m === 0x0801) return NaN; // NaN/NRes/±INF/reserved
  const mantissa = m >= 0x0800 ? m - 0x1000 : m;
  const exponent = e >= 0x8 ? e - 0x10 : e;
  return mantissa * Math.pow(10, exponent);
}

/** IEEE-11073 32-bit FLOAT. */
export function float32(raw: number): number {
  const m = raw & 0x00ffffff;
  if (m === 0x007fffff || m === 0x00800000 || m === 0x007ffffe || m === 0x00800002 || m === 0x00800001) return NaN;
  const e = (raw >> 24) & 0xff;
  const mantissa = m >= 0x00800000 ? m - 0x01000000 : m;
  const exponent = e >= 0x80 ? e - 0x100 : e;
  return mantissa * Math.pow(10, exponent);
}

/** Heart Rate Measurement (0x2A37). */
export function parseHeartRate(dv: DataView): { hr: number; rr: number[] } {
  const flags = dv.getUint8(0);
  let o = 1;
  const hr = flags & 0x01 ? dv.getUint16(o, true) : dv.getUint8(o);
  o += flags & 0x01 ? 2 : 1;
  if (flags & 0x08) o += 2; // energy expended
  const rr: number[] = [];
  if (flags & 0x10) {
    for (; o + 1 < dv.byteLength; o += 2) rr.push((dv.getUint16(o, true) / 1024) * 1000);
  }
  return { hr, rr };
}

/** PLX Spot-check (0x2A5E) or Continuous (0x2A5F) measurement: first two SFLOATs after flags. */
export function parsePlx(dv: DataView): { spo2: number; pr: number } {
  return { spo2: sfloat(dv.getUint16(1, true)), pr: sfloat(dv.getUint16(3, true)) };
}

/** Blood Pressure Measurement (0x2A35). Values returned in mmHg. */
export function parseBloodPressure(dv: DataView): { sys: number; dia: number; pulse?: number } {
  const flags = dv.getUint8(0);
  const kpa = (flags & 0x01) === 1;
  const f = (v: number) => (kpa ? v * 7.50062 : v);
  const sys = f(sfloat(dv.getUint16(1, true)));
  const dia = f(sfloat(dv.getUint16(3, true)));
  let o = 7; // flags + sys + dia + MAP
  if (flags & 0x02) o += 7; // timestamp
  const pulse = flags & 0x04 ? sfloat(dv.getUint16(o, true)) : undefined;
  return { sys, dia, pulse };
}

/** Temperature Measurement (0x2A1C). Returned in °C. */
export function parseTemperature(dv: DataView): number {
  const flags = dv.getUint8(0);
  const v = float32(dv.getUint32(1, true));
  return flags & 0x01 ? (v - 32) / 1.8 : v;
}

/** Weight Measurement (0x2A9D). Returned in kg. */
export function parseWeight(dv: DataView): number {
  const flags = dv.getUint8(0);
  const raw = dv.getUint16(1, true);
  return flags & 0x01 ? raw * 0.01 * 0.45359237 : raw * 0.005;
}

export type BleProfile = 'heart_rate' | 'pulse_oximeter' | 'blood_pressure' | 'health_thermometer' | 'weight_scale';

export const BLE_PROFILES: Record<BleProfile, { label: string; service: number; characteristic: number; mode: 'notify' | 'indicate'; examples: string }> = {
  heart_rate: { label: 'Heart-rate monitor', service: 0x180d, characteristic: 0x2a37, mode: 'notify', examples: 'Polar H10, Garmin HRM, Wahoo TICKR, many smartwatches' },
  pulse_oximeter: { label: 'Pulse oximeter', service: 0x1822, characteristic: 0x2a5f, mode: 'notify', examples: 'Nonin 3230, Masimo MightySat, Wellue O2Ring' },
  blood_pressure: { label: 'Blood-pressure cuff', service: 0x1810, characteristic: 0x2a35, mode: 'indicate', examples: 'Omron Evolv / Connect, A&D UA-651BLE' },
  health_thermometer: { label: 'Thermometer', service: 0x1809, characteristic: 0x2a1c, mode: 'indicate', examples: 'BLE clinical thermometers' },
  weight_scale: { label: 'Scale', service: 0x181d, characteristic: 0x2a9d, mode: 'indicate', examples: 'BLE smart scales (on Earth/Mars/Moon; use SLAMMD in 0 g)' },
};
