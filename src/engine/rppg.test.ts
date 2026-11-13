import { describe, expect, it } from 'vitest';
import { detrend, estimateHeartRate, fft, resample, type Sample } from './rppg';
import { prng } from '@/data/seed';

function synth(bpm: number, seconds: number, noise: number, seed = 1): Sample[] {
  const rand = prng(seed);
  const out: Sample[] = [];
  let t = 0;
  while (t < seconds * 1000) {
    const s = t / 1000;
    // pulse + slow lighting drift + noise
    out.push({ t, v: 120 + 0.6 * Math.sin(2 * Math.PI * (bpm / 60) * s) + 3 * Math.sin(2 * Math.PI * 0.05 * s) + noise * (rand() - 0.5) });
    t += 33.3 + (rand() - 0.5) * 8; // jittery ~30 fps
  }
  return out;
}

describe('rPPG pipeline', () => {
  it('FFT finds a pure tone', () => {
    const N = 64;
    const re = new Float64Array(N).map((_, i) => Math.cos((2 * Math.PI * 4 * i) / N));
    const im = new Float64Array(N);
    fft(re, im);
    const mags = Array.from(re).map((r, i) => Math.hypot(r, im[i]));
    expect(mags.indexOf(Math.max(...mags.slice(0, N / 2)))).toBe(4);
  });

  it('resamples jittery timestamps to a uniform rate', () => {
    const r = resample([{ t: 0, v: 0 }, { t: 1000, v: 30 }], 30);
    expect(r).toHaveLength(31);
    expect(r[15]).toBeCloseTo(15);
  });

  it('detrend removes slow drift and normalises', () => {
    const d = detrend(Array.from({ length: 300 }, (_, i) => i * 0.5), 30);
    const m = d.reduce((s, v) => s + v, 0) / d.length;
    expect(Math.abs(m)).toBeLessThan(1e-9);
  });

  it.each([54, 72, 96, 130])('recovers %i bpm from a noisy 20 s signal', (bpm) => {
    const est = estimateHeartRate(synth(bpm, 20, 1.2, bpm))!;
    expect(Math.abs(est.bpm - bpm)).toBeLessThanOrEqual(2);
    expect(est.confidence).toBeGreaterThan(0.5);
    expect(est.waveform.length).toBeGreaterThan(500);
  });

  it('reports low confidence for pure noise', () => {
    const rand = prng(9);
    const s: Sample[] = Array.from({ length: 600 }, (_, i) => ({ t: i * 33.3, v: 100 + 5 * (rand() - 0.5) }));
    expect(estimateHeartRate(s)!.confidence).toBeLessThan(0.4);
  });

  it('needs at least 8 s of signal', () => {
    expect(estimateHeartRate(synth(70, 5, 0))).toBeNull();
  });
});
