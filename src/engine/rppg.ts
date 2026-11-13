/**
 * Remote photoplethysmography (rPPG). EXPERIMENTAL, not a medical device.
 *
 * Blood volume changes with each heartbeat slightly alter how much green light
 * the skin absorbs. We average the green channel over a forehead region at
 * ~30 fps for ~20 s, then:
 *   1. resample to a uniform rate (camera frame timing jitters)
 *   2. detrend (subtract a 1-s moving average) and normalise
 *   3. Hann window + zero-padded FFT
 *   4. band-pass 0.7–3.0 Hz (42–180 bpm) by masking bins
 *   5. peak frequency × 60 → bpm; confidence = share of band power in the peak
 * Method after Verkruysse et al., Opt. Express 2008; Poh et al., Opt. Express 2010.
 */

export const RPPG = { fs: 30, loHz: 0.7, hiHz: 3.0, windowSec: 20, minSec: 8, fftSize: 4096 } as const;

export interface Sample {
  t: number; // ms
  v: number; // mean green value
}

export function resample(samples: Sample[], fs: number = RPPG.fs): number[] {
  if (samples.length < 2) return samples.map((s) => s.v);
  const t0 = samples[0].t;
  const t1 = samples[samples.length - 1].t;
  const n = Math.floor(((t1 - t0) / 1000) * fs) + 1;
  const out: number[] = new Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * 1000) / fs;
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j];
    const b = samples[j + 1];
    const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    out[i] = a.v + (b.v - a.v) * Math.min(1, Math.max(0, f));
  }
  return out;
}

export function detrend(x: number[], win: number): number[] {
  const half = Math.max(1, Math.floor(win / 2));
  const out = new Array<number>(x.length);
  let sum = 0;
  let count = 0;
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < x.length; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(x.length - 1, i + half);
    while (hi < b) {
      sum += x[++hi];
      count++;
    }
    while (lo < a) {
      sum -= x[lo++];
      count--;
    }
    out[i] = x[i] - sum / count;
  }
  const m = out.reduce((s, v) => s + v, 0) / out.length;
  const sd = Math.sqrt(out.reduce((s, v) => s + (v - m) ** 2, 0) / out.length) || 1;
  return out.map((v) => (v - m) / sd);
}

/** In-place iterative radix-2 complex FFT. `re.length` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

export interface RppgEstimate {
  bpm: number;
  confidence: number;
  /** Band-passed waveform (for display), same rate as `fs`. */
  waveform: number[];
  spectrum: { hz: number; power: number }[];
}

export function estimateHeartRate(samples: Sample[], fs: number = RPPG.fs): RppgEstimate | null {
  const x0 = resample(samples, fs);
  if (x0.length < fs * RPPG.minSec) return null;
  const x = detrend(x0, fs);
  const N = RPPG.fftSize;
  const n = Math.min(x.length, N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const start = x.length - n;
  for (let i = 0; i < n; i++) re[i] = x[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const binHz = fs / N;
  let peak = -1;
  let peakP = 0;
  let total = 0;
  const spectrum: RppgEstimate['spectrum'] = [];
  const power = new Float64Array(N / 2);
  for (let k = 1; k < N / 2; k++) {
    const hz = k * binHz;
    const p = re[k] ** 2 + im[k] ** 2;
    power[k] = p;
    if (hz < RPPG.loHz || hz > RPPG.hiHz) continue;
    total += p;
    spectrum.push({ hz, power: p });
    if (p > peakP) {
      peakP = p;
      peak = k;
    }
  }
  if (peak < 0 || total === 0) return null;
  // Parabolic interpolation around the peak bin.
  const a = power[peak - 1];
  const b = power[peak];
  const c = power[peak + 1] ?? b;
  const denom = a - 2 * b + c;
  const delta = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
  const hz = (peak + delta) * binHz;
  // Confidence: power within ±0.1 Hz of the peak vs total band power.
  const w = Math.round(0.1 / binHz);
  let near = 0;
  for (let k = peak - w; k <= peak + w; k++) near += power[k] ?? 0;
  const confidence = Math.max(0, Math.min(1, (near / total - 0.1) / 0.5));

  // Band-passed waveform via spectral mask + inverse FFT (display only).
  const wr = new Float64Array(N);
  const wi = new Float64Array(N);
  for (let i = 0; i < n; i++) wr[i] = x[start + i];
  fft(wr, wi);
  for (let k = 0; k < N; k++) {
    const f = (k <= N / 2 ? k : N - k) * binHz;
    if (f < RPPG.loHz || f > RPPG.hiHz) wr[k] = wi[k] = 0;
  }
  fft(wr, wi, true);
  const waveform = Array.from(wr.slice(0, n));

  return { bpm: Math.round(hz * 60), confidence, waveform, spectrum };
}
