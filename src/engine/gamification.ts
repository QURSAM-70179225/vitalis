/**
 * Crew-positive gamification. Everything is derived from health data (never stored),
 * rewards healthy behaviours rather than health outcomes, and challenges are
 * cooperative: crew totals, never rankings of individual health data.
 */
import type { CheckIn, CognitiveResult, JournalEntry, MissionEvent } from '@/types';

export const XP = { checkIn: 50, pvt: 30, journal: 20, exerciseGoal: 25, sleepGoal: 15 } as const;

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: 'Sunrise' | 'Bone' | 'Moon' | 'Droplets' | 'Zap' | 'NotebookPen' | 'ShieldHalf' | 'Flame' | 'Rocket';
  earned: boolean;
  progress: number;
  progressLabel: string;
}

export interface Progress {
  xp: number;
  level: number;
  levelTitle: string;
  xpIntoLevel: number;
  xpForLevel: number;
  streak: number;
  badges: Badge[];
  breakdown: { label: string; xp: number }[];
}

const LEVELS = ['Cadet', 'Crew Member', 'Specialist', 'Flight Engineer', 'Mission Veteran', 'Deep-Space Pro', 'Mars-Ready Elite'];
const XP_PER_LEVEL = 1500;

function maxRun(days: number[], pred: (d: number) => boolean): number {
  let best = 0;
  let cur = 0;
  let prev = -2;
  for (const d of [...days].sort((a, b) => a - b)) {
    if (pred(d) && d === prev + 1) cur++;
    else if (pred(d)) cur = 1;
    else cur = 0;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

export function computeProgress(
  checkIns: CheckIn[],
  cognitive: CognitiveResult[],
  journal: JournalEntry[],
  events: MissionEvent[],
  today: number,
  readiness: number,
): Progress {
  const byDay = new Map<number, CheckIn>();
  for (const c of checkIns) byDay.set(c.day, { ...byDay.get(c.day), ...c, values: { ...byDay.get(c.day)?.values, ...c.values } });
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const v = (d: number) => byDay.get(d)?.values ?? {};
  const exerciseGoal = (d: number) => (v(d).exerciseResistive ?? 0) >= 40 && (v(d).exerciseAerobic ?? 0) >= 25;
  const sleepGoal = (d: number) => (v(d).sleepHours ?? 0) >= 7;
  const hydGoal = (d: number) => (v(d).hydration ?? 0) >= 2000;
  const resGoal = (d: number) => (v(d).exerciseResistive ?? 0) >= 40 || d % 7 === 0;

  const nEx = days.filter(exerciseGoal).length;
  const nSleep = days.filter(sleepGoal).length;
  const breakdown = [
    { label: 'Check-ins', xp: days.length * XP.checkIn },
    { label: 'Reaction tests', xp: cognitive.length * XP.pvt },
    { label: 'Journal entries', xp: journal.length * XP.journal },
    { label: 'Exercise goals met', xp: nEx * XP.exerciseGoal },
    { label: 'Sleep goals met', xp: nSleep * XP.sleepGoal },
  ];
  const xp = breakdown.reduce((s, b) => s + b.xp, 0);
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;

  let streak = 0;
  for (let d = byDay.has(today) ? today : today - 1; byDay.has(d); d--) streak++;

  const speDays = events.filter((e) => e.type === 'spe').map((e) => e.day);
  const b = (id: string, name: string, description: string, icon: Badge['icon'], value: number, target: number, unit: string): Badge => ({
    id,
    name,
    description,
    icon,
    earned: value >= target,
    progress: Math.min(1, value / target),
    progressLabel: `${Math.min(value, target)}/${target} ${unit}`,
  });

  const badges: Badge[] = [
    b('first-light', 'First Light', 'Complete your first daily check-in.', 'Sunrise', days.length, 1, 'check-in'),
    b('bone-guardian', 'Bone Guardian', '14 days in a row hitting your resistive exercise target.', 'Bone', maxRun(days, resGoal), 14, 'days'),
    b('sleep-commander', 'Sleep Commander', '7 nights in a row with 7+ hours of sleep.', 'Moon', maxRun(days, sleepGoal), 7, 'nights'),
    b('hydro-hero', 'Hydro Hero', '7 days in a row drinking 2 L or more.', 'Droplets', maxRun(days, hydGoal), 7, 'days'),
    b('steady-hand', 'Steady Hand', 'Complete 10 reaction time tests.', 'Zap', cognitive.length, 10, 'tests'),
    b('mindful', 'Mindful Explorer', 'Write 10 mood journal entries.', 'NotebookPen', journal.length, 10, 'entries'),
    b('storm-ready', 'Storm Ready', 'Logged your dose during a solar particle event.', 'ShieldHalf', speDays.some((d) => byDay.has(d)) ? 1 : 0, 1, 'event'),
    b('streak-30', 'Unbroken Orbit', '30-day check-in streak.', 'Flame', Math.max(streak, maxRun(days, () => true)), 30, 'days'),
    b('mars-ready', 'Mars-Ready', '60 check-ins and a readiness score of 85 or more.', 'Rocket', days.length >= 60 && readiness >= 85 ? 1 : 0, 1, readiness >= 85 ? '' : `(readiness ${readiness})`),
  ];

  return {
    xp,
    level,
    levelTitle: LEVELS[Math.min(LEVELS.length - 1, level - 1)],
    xpIntoLevel: xp % XP_PER_LEVEL,
    xpForLevel: XP_PER_LEVEL,
    streak,
    badges,
    breakdown,
  };
}

export interface CrewChallenge {
  id: string;
  title: string;
  description: string;
  unit: string;
  current: number;
  target: number;
}

/** Cooperative weekly challenges: crew totals only. */
export function crewChallenges(checkIns: CheckIn[], crewSize: number, today: number): CrewChallenge[] {
  const week = checkIns.filter((c) => c.day > today - 7 && c.day <= today);
  const sum = (f: (c: CheckIn) => number) => Math.round(week.reduce((s, c) => s + f(c), 0));
  const n = Math.max(1, crewSize);
  return [
    { id: 'ex', title: 'Iron Crew', description: 'Log 70 min of exercise per person per day, together.', unit: 'min', current: sum((c) => (c.values.exerciseResistive ?? 0) + (c.values.exerciseAerobic ?? 0)), target: 70 * 7 * n },
    { id: 'hyd', title: 'Water Wall', description: 'Drink 2.2 L per person per day. Fuels the crew and the shelter.', unit: 'L', current: Math.round(sum((c) => c.values.hydration ?? 0) / 1000), target: Math.round(2.2 * 7 * n) },
    { id: 'sleep', title: 'Quiet Ship', description: 'Bank 7 h of sleep per person per night.', unit: 'h', current: sum((c) => c.values.sleepHours ?? 0), target: 7 * 7 * n },
    { id: 'ci', title: 'Full Roll Call', description: 'Every crew member checks in every day.', unit: 'check-ins', current: new Set(week.map((c) => `${c.crewId}-${c.day}`)).size, target: 7 * n },
  ];
}
