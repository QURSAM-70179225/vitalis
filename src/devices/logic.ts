import type { ChannelId, ChannelValues, StatusLevel } from '@/types';
import { levelFromBands } from '@/engine/triage';
import { CHANNELS, CHANNEL_IDS } from './channels';

export function liveLevel(id: ChannelId, v: number): StatusLevel {
  return levelFromBands(v, CHANNELS[id].bands).level;
}

/** Mean of each channel over a list of timestamped frames. */
export function aggregate(frames: { t: number; v: ChannelValues }[]): ChannelValues {
  const out: ChannelValues = {};
  for (const id of CHANNEL_IDS) {
    let s = 0;
    let n = 0;
    for (const f of frames) {
      const x = f.v[id];
      if (x !== undefined) {
        s += x;
        n++;
      }
    }
    if (n) out[id] = Number((s / n).toFixed(CHANNELS[id].digits + 1));
  }
  return out;
}

/**
 * Debounced alarm: a channel must stay at a level for `holdSec` before it alarms
 * (critical alarms after 3 s, others after 8 s) so one noisy sample can't trigger it.
 */
export function debounce(
  prev: { level: StatusLevel; since: number } | undefined,
  level: StatusLevel,
  now: number,
): { level: StatusLevel; since: number; alarm: boolean } {
  const since = prev && prev.level === level ? prev.since : now;
  const hold = level === 'critical' ? 3000 : 8000;
  return { level, since, alarm: level !== 'nominal' && level !== 'monitor' && now - since >= hold };
}
