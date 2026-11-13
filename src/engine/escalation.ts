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
        ? 'Contact the flight surgeon now (near-real-time link). Start these steps while you connect:'
        : `Ground response in ~${roughDuration(roundTripSec)} at the earliest. Start these steps now:`;
      contact = realtime
        ? 'Open a Private Medical Conference (PMC) with the flight surgeon. Alert your CMO.'
        : 'Alert your CMO now. Send a health packet to the ground. Do not wait for a reply before acting.';
      break;
    case 'act':
      headline = realtime
        ? 'Start the countermeasure today and mention it at your next medical conference.'
        : `Start the countermeasure today. The ground will see it in ~${roughDuration(oneWayDelaySec)}, and a reply takes ~${roughDuration(roundTripSec)} or more.`;
      contact = 'Inform your Crew Medical Officer. Include it in today\'s ground packet.';
      break;
    case 'monitor':
      headline = 'Keep an eye on it. Recheck as suggested and follow the guidance card.';
      contact = 'No contact needed unless it gets worse.';
      break;
    default:
      headline = 'All nominal. Continue your normal routine.';
      contact = 'No contact needed.';
  }
  return { level, realtime, roundTripSec, headline, steps, contact };
}
