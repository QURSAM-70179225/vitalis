import type { StatusLevel } from '@/types';

export const LEVEL_ORDER: StatusLevel[] = ['nominal', 'monitor', 'act', 'critical'];

export function rank(level: StatusLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

export function maxLevel(...levels: StatusLevel[]): StatusLevel {
  let best: StatusLevel = 'nominal';
  for (const l of levels) if (rank(l) > rank(best)) best = l;
  return best;
}

export interface LevelMeta {
  label: string;
  short: string;
  emoji: string;
  color: string;
  /** Tailwind classes for text / bg / border. */
  text: string;
  bg: string;
  border: string;
  description: string;
}

export const LEVEL_META: Record<StatusLevel, LevelMeta> = {
  nominal: {
    label: 'Nominal',
    short: 'GO',
    emoji: '🟢',
    color: '#34d399',
    text: 'text-nominal',
    bg: 'bg-nominal/15',
    border: 'border-nominal/50',
    description: 'Within your normal range. Keep it up.',
  },
  monitor: {
    label: 'Monitor',
    short: 'WATCH',
    emoji: '🟡',
    color: '#facc15',
    text: 'text-monitor',
    bg: 'bg-monitor/15',
    border: 'border-monitor/50',
    description: 'Something is drifting. Recheck and follow the guidance.',
  },
  act: {
    label: 'Act Now',
    short: 'ACT',
    emoji: '🟠',
    color: '#fb923c',
    text: 'text-act',
    bg: 'bg-act/15',
    border: 'border-act/50',
    description: 'Start the countermeasure today and inform your CMO.',
  },
  critical: {
    label: 'Contact Flight Surgeon',
    short: 'ALERT',
    emoji: '🔴',
    color: '#f87171',
    text: 'text-critical',
    bg: 'bg-critical/15',
    border: 'border-critical/60',
    description: 'Start the checklist now and contact the flight surgeon / CMO.',
  },
};
