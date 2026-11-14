import type { Alert, StatusLevel } from '@/types';
import { formatDelay } from '@/data/environments';

/** Human-friendly rough duration: seconds under 2 min, whole minutes above. */
export function roughDuration(sec: number): string {
  return sec >= 120 ? `${Math.round(sec / 60)} min` : formatDelay(sec);
}

export interface EscalationPlan {
  level: StatusLevel;
  realtime: boolean;
  /** Round-trip (ask + answer) seconds. */
  roundTripSec: number;
  headline: string;
  steps: string[];
  contact: string;
}

/**
 * Comm-delay-aware escalation. With a one-way delay of D, the earliest ground answer
 * arrives after ~2·D (plus human response time). Beyond ~1 min, the crew must start
 * the checklist autonomously rather than wait.
 */
export function escalationPlan(level: StatusLevel, oneWayDelaySec: number, alert?: Alert): EscalationPlan {
  const roundTripSec = 2 * oneWayDelaySec;
  const realtime = oneWayDelaySec < 30;
  const steps = alert?.actions ?? [];
  let headline: string;
  let contact: string;
  switch (level) {
    case 'critical':
      headline = realtime
        ? 'Call the doctors on Earth now. Start these steps while you connect:'
        : `The doctors on Earth can answer in ~${roughDuration(roundTripSec)} at the earliest. Start these steps now:`;
      contact = realtime
        ? 'Call the doctors on Earth on a private line, and tell your crew medical officer.'
        : 'Tell your crew medical officer now and send your health report to Earth. Don\'t wait for their reply before you act.';
      break;
    case 'act':
      headline = realtime
        ? 'Do the steps today and mention it at your next call with the doctors.'
        : `Do the steps today. Earth will see your report in about ${roughDuration(oneWayDelaySec)}, and an answer takes ${roughDuration(roundTripSec)} or more.`;
      contact = 'Tell your crew medical officer, and include it in today\'s report to Earth.';
      break;
    case 'monitor':
      headline = 'Keep an eye on it. Check again later and follow the tips.';
      contact = 'No need to call anyone unless it gets worse.';
      break;
    default:
      headline = 'All good. Carry on with your normal day.';
      contact = 'No need to call anyone.';
  }
  return { level, realtime, roundTripSec, headline, steps, contact };
}
