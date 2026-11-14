/**
 * Emotional wellbeing helpers (pure): mood calendar and gentle, mood-aware
 * suggestions for someone living far from home. Never diagnostic.
 */
import type { CheckIn, JournalEntry } from '@/types';
import { mean } from './baseline';

export interface MoodDay {
  day: number;
  mood: number | null;
}

/** One mood per day (check-in mood, or the journal mood if that's all there is). */
export function moodCalendar(checkIns: CheckIn[], journal: JournalEntry[], fromDay: number, toDay: number): MoodDay[] {
  const byDay = new Map<number, number>();
  for (const j of journal) if (j.day >= fromDay && j.day <= toDay) byDay.set(j.day, j.mood);
  for (const c of checkIns) if (c.day >= fromDay && c.day <= toDay && c.values.mood !== undefined) byDay.set(c.day, c.values.mood);
  const out: MoodDay[] = [];
  for (let d = fromDay; d <= toDay; d++) out.push({ day: d, mood: byDay.get(d) ?? null });
  return out;
}

export interface Suggestion {
  id: string;
  title: string;
  body: string;
  route?: string;
}

/** Suggestions based on how the astronaut is doing lately. */
export function wellbeingSuggestions(p: { mood?: number; stress?: number; sleep?: number; recentMoods: (number | null)[]; daysSinceHome: number }): {
  tone: 'low' | 'okay' | 'good';
  message: string;
  suggestions: Suggestion[];
} {
  const moods = p.recentMoods.filter((m): m is number => m !== null);
  const avg = moods.length ? mean(moods) : (p.mood ?? 4);
  const low = (p.mood ?? avg) <= 2 || avg <= 2.5;
  const stressed = (p.stress ?? 0) >= 4;
  const tired = p.sleep !== undefined && p.sleep < 6.5;
  const s: Suggestion[] = [];

  if (low || stressed) s.push({ id: 'breathe', title: '2-minute calm breathing', body: 'Breathe in for 4, hold for 7, out for 8. It slows your heart and quiets your mind.', route: 'cognitive' });
  if (p.daysSinceHome >= 3 || low) s.push({ id: 'home', title: 'Reach out to home', body: 'Record a short video or write a message to someone you love. Hearing from you matters to them too.', route: 'guidance/connect-home' });
  if (low) s.push({ id: 'crew', title: 'Talk to a crewmate', body: "You don't have to carry it alone. Share a meal or a few minutes with someone on board." });
  if (low) s.push({ id: 'cmo', title: 'Tell your crew medical officer', body: 'If you have felt low for a few days, a private chat can really help. It is completely normal on long missions.' });
  if (tired) s.push({ id: 'sleep', title: 'Protect your sleep tonight', body: 'Warm, dim lights 2 hours before bed and no screens in your sleep station.', route: 'guidance/sleep-hygiene' });
  if (!low) s.push({ id: 'good', title: 'Write down 3 good things', body: 'Small wins count: a view of Earth, a good meal, a laugh with the crew.' });
  s.push({ id: 'window', title: 'Look out the window', body: 'A few quiet minutes looking at Earth or the stars helps many astronauts feel calmer and more connected.' });

  const tone = low ? 'low' : stressed || tired ? 'okay' : 'good';
  const message =
    tone === 'low'
      ? "It sounds like things have been hard lately. Feeling low far from home is normal, and you're not alone. Here are a few things that can help."
      : tone === 'okay'
        ? "You're doing okay, but you've been carrying a lot. A little care today goes a long way."
        : "You're doing well. Keep the habits that help you feel good.";
  return { tone, message, suggestions: s.slice(0, 4) };
}
