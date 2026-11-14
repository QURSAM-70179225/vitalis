import { motion } from 'framer-motion';
import { Home, Sparkles } from 'lucide-react';
import { useCrewData, useMissionContext } from '@/hooks/useMission';
import { MOOD_EMOJI, MOOD_LABELS } from '@/data/indicators';
import { moodCalendar, wellbeingSuggestions } from '@/engine/wellbeing';
import { navigate } from '@/hooks/useRoute';
import { cn } from '@/utils';
import { Panel } from '@/components/ui';

const MOOD_BG = ['bg-critical/30', 'bg-act/30', 'bg-monitor/25', 'bg-nominal/20', 'bg-nominal/35'];

/** Emotional wellbeing far from home: days away, 30-day mood calendar, kind suggestions. */
export function AwayFromHome() {
  const { day } = useMissionContext();
  const { checkIns, journal } = useCrewData();
  const from = Math.max(1, day - 29);
  const cal = moodCalendar(checkIns, journal, from, day);
  const lastHome = [...journal].reverse().find((j) => j.connectedHome);
  const daysSinceHome = lastHome ? day - lastHome.day : day;
  const latest = [...checkIns].reverse().find((c) => c.values.mood !== undefined);
  const w = wellbeingSuggestions({
    mood: latest?.values.mood,
    stress: latest?.values.stress,
    sleep: latest?.values.sleepHours,
    recentMoods: cal.slice(-7).map((d) => d.mood),
    daysSinceHome,
  });
  const logged = cal.filter((d) => d.mood !== null);
  const goodDays = logged.filter((d) => (d.mood ?? 0) >= 4).length;

  return (
    <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
      <Panel aria-labelledby="home-h" className="relative overflow-hidden">
        <motion.div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-sky-400/30 to-emerald-400/20 blur-2xl" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 6, repeat: Infinity }} aria-hidden />
        <h2 id="home-h" className="h2 mb-2 flex items-center gap-2">
          <Home className="h-5 w-5 text-accent" aria-hidden /> Far from home
        </h2>
        <p className="numeral text-5xl">{day}</p>
        <p className="muted mb-3 text-sm">days since you left Earth</p>
        <p className="text-sm">
          {daysSinceHome === 0
            ? 'You connected with home today. That really helps. 💙'
            : `It's been ${daysSinceHome} day${daysSinceHome === 1 ? '' : 's'} since you logged contact with home.`}
        </p>
        <p className="muted mt-3 text-xs">Missing home, feeling bored or feeling lonely on a long mission is completely normal. Your feelings are part of your health, just like your heart.</p>
      </Panel>

      <Panel aria-labelledby="cal-h">
        <h2 id="cal-h" className="h2 mb-1">How you've felt (last 30 days)</h2>
        <p className="muted mb-3 text-sm">
          {logged.length ? `${goodDays} good days out of ${logged.length}.` : 'Your mood from each check-in will appear here.'}
        </p>
        <ol className="grid grid-cols-10 gap-1.5" aria-label="Mood calendar">
          {cal.map((d) => (
            <li
              key={d.day}
              className={cn('grid aspect-square place-items-center rounded-lg text-lg', d.mood ? MOOD_BG[d.mood - 1] : 'bg-white/5')}
              title={`SOL ${d.day}: ${d.mood ? MOOD_LABELS[d.mood - 1] : 'no entry'}`}
              aria-label={`SOL ${d.day}: ${d.mood ? MOOD_LABELS[d.mood - 1] : 'no entry'}`}
            >
              {d.mood ? MOOD_EMOJI[d.mood - 1] : <span className="text-[10px] text-slate-500">{d.day}</span>}
            </li>
          ))}
        </ol>
      </Panel>

      <Panel className={cn('lg:col-span-2', w.tone === 'low' ? 'border-act/40' : w.tone === 'okay' ? 'border-monitor/40' : 'border-nominal/40')} aria-labelledby="help-h">
        <h2 id="help-h" className="h2 mb-1 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-monitor" aria-hidden /> Right now, this might help
        </h2>
        <p className="mb-4 text-sm">{w.message}</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {w.suggestions.map((s) => (
            <li key={s.id}>
              <button
                className={cn('focus-ring h-full w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition', s.route && 'hover:border-accent hover:bg-accent/10')}
                onClick={() => s.route && navigate(s.route)}
                disabled={!s.route}
              >
                <span className="block font-semibold">{s.title}</span>
                <span className="muted mt-1 block text-xs">{s.body}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
