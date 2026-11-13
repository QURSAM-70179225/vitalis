import { describe, expect, it } from 'vitest';
import { float32, parseBloodPressure, parseHeartRate, parsePlx, parseTemperature, parseWeight, sfloat } from './gatt';
import { parseFrame, splitLines } from './protocol';
import { rmssd } from './channels';
import { aggregate, liveLevel } from './logic';
import { SuitSimulator } from './simulator';

const dv = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

describe('IEEE-11073 numbers', () => {
  it('decodes SFLOAT', () => {
    expect(sfloat(0x0062)).toBe(98); // 98 × 10^0
    expect(sfloat(0xf16f)).toBeCloseTo(36.7); // 367 × 10^-1
    expect(Number.isNaN(sfloat(0x07ff))).toBe(true);
  });
  it('decodes FLOAT', () => {
    expect(float32(0xff00016f)).toBeCloseTo(36.7);
  });
});

describe('Bluetooth GATT health profiles', () => {
  it('heart rate (uint8, with RR intervals)', () => {
    const r = parseHeartRate(dv([0x10, 72, 0x00, 0x04, 0x00, 0x04])); // RR 1024/1024 s
    expect(r.hr).toBe(72);
    expect(r.rr).toEqual([1000, 1000]);
  });
  it('heart rate (uint16, energy expended skipped)', () => {
    const r = parseHeartRate(dv([0x09, 0x2c, 0x01, 0x10, 0x00]));
    expect(r.hr).toBe(300);
  });
  it('pulse oximeter', () => {
    expect(parsePlx(dv([0x00, 0x61, 0x00, 0x48, 0x00]))).toEqual({ spo2: 97, pr: 72 });
  });
  it('blood pressure in mmHg with pulse', () => {
    // flags: pulse present (0x04); sys 120, dia 80, MAP 93, pulse 64
    const r = parseBloodPressure(dv([0x04, 120, 0, 80, 0, 93, 0, 64, 0]));
    expect(r).toEqual({ sys: 120, dia: 80, pulse: 64 });
  });
  it('blood pressure in kPa converted to mmHg', () => {
    const r = parseBloodPressure(dv([0x01, 0xa0, 0xf0, 0x6b, 0xf0, 0, 0])); // 16.0 / 10.7 kPa
    expect(r.sys).toBeCloseTo(120, 0);
    expect(r.dia).toBeCloseTo(80, 0);
  });
  it('thermometer °C and °F', () => {
    expect(parseTemperature(dv([0x00, 0x6f, 0x01, 0x00, 0xff]))).toBeCloseTo(36.7);
    expect(parseTemperature(dv([0x01, 0xd2, 0x03, 0x00, 0xff]))).toBeCloseTo(37, 0); // 98.6 °F
  });
  it('scale (SI resolution 0.005 kg)', () => {
    expect(parseWeight(dv([0x00, 0x40, 0x38]))).toBeCloseTo(72.0);
  });
});

describe('telemetry protocol', () => {
  it('parses JSON lines with aliases and drops out-of-range values', () => {
    expect(parseFrame('{"heartRate":92,"SpO2":97,"suit_kpa":29.5,"co2":3.1,"bogus":1,"temp":99}')).toEqual({ hr: 92, spo2: 97, suitPressure: 29.5, suitCo2: 3.1 });
    expect(parseFrame('not json')).toBeNull();
    expect(parseFrame('{"x":1}')).toBeNull();
  });
  it('splits streaming buffers', () => {
    expect(splitLines('{"hr":1}\r\n{"hr":2}\n{"hr"')).toEqual({ lines: ['{"hr":1}', '{"hr":2}'], rest: '{"hr"' });
  });
});

describe('live logic', () => {
  it('RMSSD', () => {
    expect(rmssd([800, 810, 790])).toBeCloseTo(Math.sqrt((100 + 400) / 2));
    expect(rmssd([800])).toBeNull();
  });
  it('alarm levels', () => {
    expect(liveLevel('spo2', 87)).toBe('critical');
    expect(liveLevel('suitPressure', 26)).toBe('act');
    expect(liveLevel('suitCo2', 2)).toBe('nominal');
  });
  it('aggregates samples into a one-minute mean', () => {
    const a = aggregate([
      { t: 0, v: { hr: 60, spo2: 98 } },
      { t: 1, v: { hr: 70 } },
    ]);
    expect(a).toEqual({ hr: 65, spo2: 98 });
  });
  it('simulator stays nominal, and injected faults trip alarms', () => {
    const sim = new SuitSimulator(1);
    for (let i = 0; i < 120; i++) sim.step(1);
    const f = sim.step(1);
    expect(liveLevel('suitPressure', f.suitPressure!)).toBe('nominal');
    sim.inject('suit-leak');
    let g = f;
    for (let i = 0; i < 60; i++) g = sim.step(1);
    expect(['act', 'critical']).toContain(liveLevel('suitPressure', g.suitPressure!));
  });
});
