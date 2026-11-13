/**
 * Realistic EVA / cabin telemetry generator for testing without hardware.
 * Faults can be injected to rehearse emergencies (and demo the ground console).
 */
import type { ChannelValues } from '@/types';
import { prng } from '@/data/seed';

export type Fault = 'suit-leak' | 'co2-scrubber' | 'spe' | 'tachycardia' | 'hypoxia' | 'fever';

export const FAULTS: Record<Fault, string> = {
  'suit-leak': 'Suit pressure leak',
  'co2-scrubber': 'CO₂ scrubber failure',
  spe: 'Solar particle event',
  tachycardia: 'Tachycardia',
  hypoxia: 'Low oxygen saturation',
  fever: 'Rising body temperature',
};

export class SuitSimulator {
  private rand: () => number;
  private t = 0;
  private faults = new Map<Fault, number>();
  private o2 = 100;
  private co2 = 1.5;
  private pressure = 29.6;
  private temp = 36.8;
  eva: boolean;

  constructor(seed = Date.now(), eva = true) {
    this.rand = prng(seed);
    this.eva = eva;
  }

  inject(f: Fault): void {
    this.faults.set(f, this.t);
  }
  clear(): void {
    this.faults.clear();
    this.pressure = 29.6;
    this.co2 = 1.5;
  }
  activeFaults(): Fault[] {
    return [...this.faults.keys()];
  }

  /** Advance by `dt` seconds and return one telemetry frame. */
  step(dt = 1): ChannelValues {
    this.t += dt;
    const n = () => this.rand() - 0.5;
    const since = (f: Fault) => (this.faults.has(f) ? this.t - this.faults.get(f)! : -1);
    const work = this.eva ? 0.5 + 0.5 * Math.sin(this.t / 90) : 0.1; // EVA workload cycles

    let hr = 68 + 45 * work + 3 * n();
    if (since('tachycardia') >= 0) hr = Math.min(185, 125 + since('tachycardia') * 1.2 + 4 * n());
    let spo2 = 98 - 0.6 * work + 0.6 * n();
    if (since('hypoxia') >= 0) spo2 = Math.max(80, 95 - since('hypoxia') * 0.25 + n());
    if (since('fever') >= 0) this.temp = Math.min(39.8, this.temp + 0.01 * dt);
    else this.temp += (36.8 + 0.8 * work - this.temp) * 0.01 * dt;
    const resp = 13 + 10 * work + n();

    if (this.eva) {
      this.o2 = Math.max(0, this.o2 - (0.006 + 0.01 * work) * dt);
      const scrub = since('co2-scrubber') >= 0 ? 0 : 1;
      this.co2 = Math.max(0.5, this.co2 + (0.02 * (1 + work) - 0.03 * scrub * Math.max(0, this.co2 - 1.2)) * dt);
      const leak = since('suit-leak') >= 0 ? 0.06 : 0;
      this.pressure = Math.max(0, this.pressure - leak * dt + 0.01 * n());
    }
    let dose = 76 + 6 * n(); // ~1.84 mSv/day deep-space GCR
    if (since('spe') >= 0) dose = Math.min(60000, 76 * Math.exp(since('spe') / 12));

    const frame: ChannelValues = {
      hr: Math.round(hr),
      hrv: Math.round(Math.max(8, 45 - 30 * work + 6 * n() - (hr > 120 ? 15 : 0))),
      spo2: Math.round(Math.min(100, spo2)),
      temp: Number(this.temp.toFixed(1)),
      resp: Math.round(resp),
      doseRate: Math.round(dose),
    };
    if (this.eva) {
      frame.suitPressure = Number(this.pressure.toFixed(1));
      frame.suitCo2 = Number(this.co2.toFixed(1));
      frame.o2 = Math.round(this.o2);
    }
    return frame;
  }
}
