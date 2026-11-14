/**
 * Maps mission days onto REAL NASA radiation measurements (Curiosity RAD, cruise to Mars).
 * Pure: no storage, no network.
 *
 * Demo mission day 1 = 27 Jan 2012, so day 42 = 8 Mar 2012, the strongest solar particle event
 * Curiosity measured on its way to Mars. The rare days with no RAD observation are filled by
 * linear interpolation between the neighbouring measured days and marked `filled`.
 */
import { MSL_RAD_CRUISE, type RadDay } from './mslRadCruise';

export const DEMO_RAD_START = '2012-01-27';

const BY_DATE = new Map<string, RadDay>(MSL_RAD_CRUISE.map((r) => [r.d, r]));

function addDays(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface MissionRadDay {
  day: number;
  date: string;
  /** Crew dose-equivalent estimate, mSv/day (derived from measured absorbed dose). */
  doseMsv: number;
  /** Measured absorbed dose, mGy/day. */
  absorbedMgy: number;
  solarEvent: boolean;
  /** No RAD observation that day: interpolated. */
  filled: boolean;
}

/** Real RAD-based radiation for mission day `day` (1-based), starting at `start`. */
export function realRadiationForDay(day: number, start: string = DEMO_RAD_START): MissionRadDay | null {
  const date = addDays(start, day - 1);
  const hit = BY_DATE.get(date);
  if (hit) return { day, date, doseMsv: hit.q, absorbedMgy: hit.a, solarEvent: hit.s, filled: false };
  // Interpolate between the nearest measured days (within a week).
  let before: RadDay | undefined;
  let after: RadDay | undefined;
  let gb = 0;
  let ga = 0;
  for (let i = 1; i <= 7 && !before; i++) if ((before = BY_DATE.get(addDays(date, -i)))) gb = i;
  for (let i = 1; i <= 7 && !after; i++) if ((after = BY_DATE.get(addDays(date, i)))) ga = i;
  if (!before || !after) return null;
  const w = gb / (gb + ga);
  const lerp = (x: number, y: number) => Math.round((x + (y - x) * w) * 1000) / 1000;
  return { day, date, doseMsv: lerp(before.q, after.q), absorbedMgy: lerp(before.a, after.a), solarEvent: false, filled: true };
}

/** All mission days that have real data (measured or filled), for charts and tests. */
export function realRadiationTimeline(days: number, start: string = DEMO_RAD_START): MissionRadDay[] {
  const out: MissionRadDay[] = [];
  for (let d = 1; d <= days; d++) {
    const r = realRadiationForDay(d, start);
    if (r) out.push(r);
  }
  return out;
}
