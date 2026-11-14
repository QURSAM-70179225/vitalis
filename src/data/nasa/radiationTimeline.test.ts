import { describe, expect, it } from 'vitest';
import { MSL_RAD_CRUISE, MSL_RAD_SOURCE } from './mslRadCruise';
import { realRadiationForDay, realRadiationTimeline } from './radiationTimeline';

describe('real NASA Curiosity RAD cruise data', () => {
  it('covers the whole cruise to Mars', () => {
    expect(MSL_RAD_CRUISE).toHaveLength(MSL_RAD_SOURCE.days);
    expect(MSL_RAD_SOURCE.from).toBe('2011-12-06');
    expect(MSL_RAD_SOURCE.to).toBe('2012-07-14');
    expect(MSL_RAD_SOURCE.observations).toBeGreaterThan(15000);
  });

  it('quiet days match the published cruise dose (Zeitlin et al. 2013: 0.481 mGy/day average)', () => {
    expect(MSL_RAD_SOURCE.backgroundMgyPerDay).toBeGreaterThan(0.4);
    expect(MSL_RAD_SOURCE.backgroundMgyPerDay).toBeLessThan(0.5);
  });

  it('contains the known solar storms of Jan, Mar and May 2012', () => {
    const storms = MSL_RAD_CRUISE.filter((r) => r.s).map((r) => r.d);
    expect(storms).toEqual(expect.arrayContaining(['2012-01-28', '2012-03-08', '2012-05-17']));
    const peak = MSL_RAD_CRUISE.reduce((m, r) => (r.a > m.a ? r : m));
    expect(peak.d).toBe('2012-03-08');
  });

  it('maps the demo mission: day 42 = 8 Mar 2012 storm, every day has a value', () => {
    expect(realRadiationForDay(42)!.date).toBe('2012-03-08');
    expect(realRadiationForDay(42)!.solarEvent).toBe(true);
    const tl = realRadiationTimeline(90);
    expect(tl).toHaveLength(90);
    expect(tl.reduce((m, r) => (r.doseMsv > m.doseMsv ? r : m)).day).toBe(42);
    // Only a few days had no RAD observation and are interpolated.
    expect(tl.filter((r) => r.filled).length).toBeLessThanOrEqual(4);
  });
});
