/**
 * Psychomotor Vigilance Task (PVT) scoring, after Basner & Dinges (Sleep 2011):
 *  - valid response: RT >= 100 ms
 *  - false start: response before stimulus or RT < 100 ms
 *  - lapse: RT >= 500 ms
 */
export const PVT = {
  minIsiMs: 2000,
  maxIsiMs: 8000,
  lapseMs: 500,
  falseStartMs: 100,
  timeoutMs: 5000,
} as const;

export interface PvtSummary {
  trials: number;
  meanRt: number;
  medianRt: number;
  lapses: number;
  falseStarts: number;
  fastest10: number;
  slowest10: number;
}

export function summarizePvt(rts: number[], falseStarts: number): PvtSummary {
  const valid = rts.filter((r) => r >= PVT.falseStartMs).sort((a, b) => a - b);
  const extraFalse = rts.length - valid.length;
  if (!valid.length) return { trials: 0, meanRt: 0, medianRt: 0, lapses: 0, falseStarts: falseStarts + extraFalse, fastest10: 0, slowest10: 0 };
  const mean = valid.reduce((s, r) => s + r, 0) / valid.length;
  const mid = Math.floor(valid.length / 2);
  const median = valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  const k = Math.max(1, Math.round(valid.length * 0.1));
  const avg = (xs: number[]) => xs.reduce((s, r) => s + r, 0) / xs.length;
  return {
    trials: valid.length,
    meanRt: Math.round(mean),
    medianRt: Math.round(median),
    lapses: valid.filter((r) => r >= PVT.lapseMs).length,
    falseStarts: falseStarts + extraFalse,
    fastest10: Math.round(avg(valid.slice(0, k))),
    slowest10: Math.round(avg(valid.slice(-k))),
  };
}

/** Random inter-stimulus interval. */
export function nextIsi(rand: () => number = Math.random): number {
  return PVT.minIsiMs + rand() * (PVT.maxIsiMs - PVT.minIsiMs);
}

/** Isolation & confinement wellbeing score (0–100) from 1–5 answers. */
export function wellbeingScore(answers: number[]): number {
  if (!answers.length) return 0;
  const sum = answers.reduce((s, a) => s + a, 0);
  return Math.round(((sum - answers.length) / (answers.length * 4)) * 100);
}
