/**
 * Reads vital signs out of free text from a health report (typed, pasted, or
 * recognised from a photo). Tolerant of common OCR noise ("Sp02", "BP:120 / 80").
 * Values are converted to the app's units and checked against plausible ranges.
 * The astronaut always confirms the values before they are used.
 */
import type { IndicatorId, IndicatorValues } from '@/types';
import { INDICATORS } from '@/data/indicators';

export interface FoundValue {
  indicator: IndicatorId;
  value: number;
  /** The text the value was read from, shown so the astronaut can check it. */
  source: string;
}

const num = (s: string) => Number(s.replace(',', '.'));

function inRange(id: IndicatorId, v: number): boolean {
  const m = INDICATORS[id];
  return Number.isFinite(v) && v >= m.min && v <= m.max;
}

export function parseHealthReport(raw: string): { values: IndicatorValues; found: FoundValue[] } {
  // Normalise common OCR confusions and spacing.
  const text = raw
    .replace(/[|]/g, '/')
    .replace(/\bsp[o0]2\b/gi, 'spo2')
    .replace(/\bo2\s*sat\w*/gi, 'spo2')
    .replace(/[ \t]+/g, ' ');
  const found: FoundValue[] = [];
  const add = (id: IndicatorId, v: number, src: string) => {
    if (found.some((f) => f.indicator === id)) return;
    const value = Math.round(v * 100) / 100;
    if (inRange(id, value)) found.push({ indicator: id, value, source: src.trim().slice(0, 60) });
  };

  // Blood pressure: "BP 120/80", "Blood pressure: 132 / 84 mmHg", or a bare "118/76 mmHg".
  const bp = text.match(/(?:blood\s*pressure|\bbp\b)[^\d\n]{0,20}(\d{2,3})\s*\/\s*(\d{2,3})/i) ?? text.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\s*mm\s*hg/i);
  if (bp) {
    add('systolic', num(bp[1]), bp[0]);
    add('diastolic', num(bp[2]), bp[0]);
  }

  const rules: { id: IndicatorId; re: RegExp; conv?: (v: number, m: RegExpMatchArray) => number }[] = [
    { id: 'heartRate', re: /(?:heart\s*rate|pulse(?:\s*rate)?|\bhr\b)[^\d\n]{0,15}(\d{2,3})/i },
    { id: 'spo2', re: /(?:spo2|oxygen\s*saturation|saturation|blood\s*oxygen)[^\d\n]{0,15}(\d{2,3})/i },
    {
      id: 'temperature',
      re: /(?:temp(?:erature)?|body\s*temp)[^\d\n]{0,15}(\d{2,3}(?:[.,]\d{1,2})?)\s*°?\s*([cf])?/i,
      conv: (v, m) => (m[2]?.toLowerCase() === 'f' || v > 50 ? (v - 32) / 1.8 : v),
    },
    {
      id: 'glucose',
      re: /(?:glucose|blood\s*sugar|\bbg\b)[^\d\n]{0,20}(\d{1,3}(?:[.,]\d{1,2})?)\s*(mmol)?/i,
      conv: (v, m) => (m[2] || v < 30 ? v * 18.016 : v),
    },
    { id: 'respRate', re: /(?:resp(?:iratory|iration)?\s*rate|respiration|breathing\s*rate|breaths?(?:\s*per\s*min(?:ute)?)?|\brr\b)[^\d\n]{0,15}(\d{1,2})/i },
    {
      id: 'bodyMass',
      re: /(?:body\s*weight|weight|body\s*mass)[^\d\n]{0,15}(\d{2,3}(?:[.,]\d{1,2})?)\s*(kg|lbs?)?/i,
      conv: (v, m) => (m[2]?.toLowerCase().startsWith('lb') ? v * 0.45359237 : v),
    },
    { id: 'sleepHours', re: /(?:sleep|slept)[^\d\n]{0,15}(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:h|hr|hrs|hours)\b/i },
    {
      id: 'radiationDose',
      re: /(?:radiation|dose)[^\d\n]{0,20}(\d+(?:[.,]\d+)?)\s*(m?sv|[uµ]sv)/i,
      conv: (v, m) => (/^[uµ]/i.test(m[2]) ? v / 1000 : v),
    },
    { id: 'hydration', re: /(?:fluid(?:\s*intake)?|water(?:\s*intake)?|hydration)[^\d\n]{0,15}(\d{3,4})\s*ml/i },
  ];
  for (const r of rules) {
    const m = text.match(r.re);
    if (!m) continue;
    const v = num(m[1]);
    add(r.id, r.conv ? r.conv(v, m) : v, m[0]);
  }

  const values: IndicatorValues = {};
  for (const f of found) values[f.indicator] = f.value;
  return { values, found };
}
