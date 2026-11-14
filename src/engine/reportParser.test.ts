import { describe, expect, it } from 'vitest';
import { parseHealthReport } from './reportParser';

describe('health report reader', () => {
  it('reads a typical report', () => {
    const r = parseHealthReport(`
      CREW HEALTH REPORT — SOL 41
      Heart Rate: 64 bpm
      Blood Pressure: 132/84 mmHg
      SpO2: 97 %
      Temperature: 36.9 C
      Glucose (fasting): 94 mg/dL
      Respiratory rate: 15 /min
      Body weight: 71.4 kg
    `);
    expect(r.values).toEqual({ heartRate: 64, systolic: 132, diastolic: 84, spo2: 97, temperature: 36.9, glucose: 94, respRate: 15, bodyMass: 71.4 });
    expect(r.found.find((f) => f.indicator === 'systolic')!.source).toMatch(/132\/84/);
  });

  it('copes with OCR noise and other units', () => {
    const r = parseHealthReport('Pulse 72 | BP:118 | 76 | Sp02 98 | Temp 98.6 F | Blood sugar 5.2 mmol/L | Weight 160 lb | Dose 1840 uSv');
    expect(r.values.heartRate).toBe(72);
    expect(r.values.systolic).toBe(118);
    expect(r.values.diastolic).toBe(76);
    expect(r.values.spo2).toBe(98);
    expect(r.values.temperature).toBeCloseTo(37, 1);
    expect(r.values.glucose).toBeCloseTo(93.7, 0);
    expect(r.values.bodyMass).toBeCloseTo(72.57, 1);
    expect(r.values.radiationDose).toBeCloseTo(1.84, 2);
  });

  it('ignores impossible values and unrelated text', () => {
    const r = parseHealthReport('Heart rate 999 bpm. Room 12/40. Meeting at 10:30.');
    expect(r.values).toEqual({});
  });

  it('reads sleep, water and a bare blood pressure', () => {
    const r = parseHealthReport('Slept 6.5 hours. Water intake 1800 ml. 121/79 mmHg');
    expect(r.values).toMatchObject({ sleepHours: 6.5, hydration: 1800, systolic: 121, diastolic: 79 });
  });
});
