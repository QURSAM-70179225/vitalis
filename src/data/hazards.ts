import type { HazardId } from '@/types';

export interface HazardInfo {
  id: HazardId;
  name: string;
  short: string;
  description: string;
  /** lucide-react icon name, resolved in components/HazardBadge. */
  icon: 'Radiation' | 'UsersRound' | 'Globe2' | 'Orbit' | 'Wind';
  color: string;
}

/** NASA Human Research Program — the five hazards of human spaceflight. */
export const HAZARDS: Record<HazardId, HazardInfo> = {
  radiation: {
    id: 'radiation',
    name: 'Space Radiation',
    short: 'Radiation',
    description:
      'Galactic cosmic rays and solar particle events raise cancer risk and can affect the central nervous system, heart and tissues.',
    icon: 'Radiation',
    color: '#f472b6',
  },
  isolation: {
    id: 'isolation',
    name: 'Isolation & Confinement',
    short: 'Isolation',
    description:
      'Small crews in small spaces for months affect mood, sleep, cognition and team dynamics.',
    icon: 'UsersRound',
    color: '#a78bfa',
  },
  distance: {
    id: 'distance',
    name: 'Distance from Earth',
    short: 'Distance',
    description:
      'Communication delays and no quick return mean the crew must handle medical events on their own.',
    icon: 'Globe2',
    color: '#60a5fa',
  },
  gravity: {
    id: 'gravity',
    name: 'Gravity Fields',
    short: 'Gravity',
    description:
      'Weightlessness and gravity transitions shift fluids, weaken bone and muscle, and affect balance, vision and the heart.',
    icon: 'Orbit',
    color: '#22d3ee',
  },
  environment: {
    id: 'environment',
    name: 'Hostile / Closed Environments',
    short: 'Closed Env.',
    description:
      'Spacecraft air, CO₂, noise, lighting, microbes and dust all affect health in a closed loop.',
    icon: 'Wind',
    color: '#4ade80',
  },
};

export const HAZARD_LIST = Object.values(HAZARDS);
