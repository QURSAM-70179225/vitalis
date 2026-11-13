import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bone, Droplets, Flame, Lock, Moon, NotebookPen, Rocket, ShieldHalf, Sunrise, Users, Zap, type LucideIcon } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { useCrewData, useMissionContext, useTriage } from '@/hooks/useMission';
import { computeProgress, crewChallenges, type Badge } from '@/engine/gamification';
import { cn } from '@/utils';
import { PageHeader, Panel, ProgressRing, readinessColor } from '@/components/ui';

const ICONS: Record<Badge['icon'], LucideIcon> = { Sunrise, Bone, Moon, Droplets, Zap, NotebookPen, ShieldHalf, Flame, Rocket };

export default function Achievements() {
  const { day, crewMember } = useMissionContext();
  const { checkIns, cognitive, journal } = useCrewData();
  const allCheckIns = useApp((s) => s.checkIns);
  const crew = useApp((s) => s.crew);
  const events = useApp((s) => s.events);
  const triage = useTriage();
  const readiness = triage?.readiness ?? 0;
  const p = useMemo(() => computeProgress(checkIns, cognitive, journal, events, day, readiness), [checkIns, cognitive, journal, events, day, readiness]);
  const challenges = useMemo(() => crewChallenges(allCheckIns, crew.length, day), [allCheckIns, crew.length, day]);

  return (
    <>
      <PageHeader eyebrow={`${crewMember?.callsign} · crew-positive progress`} title="Achievements" subtitle="Rewards for healthy habits, never for health outcomes. Crew challenges are shared goals, with no rankings and no comparing people's health data." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="flex items-center gap-5" data-tour="xp">
          <ProgressRing value={(p.xpIntoLevel / p.xpForLevel) * 100} size={110} label={`Level ${p.level}, ${p.xpIntoLevel} of ${p.xpForLevel} XP`}>
            <div>
              <p className="numeral text-3xl">L{p.level}</p>
              <p className="muted text-[10px] uppercase tracking-widest">level</p>
            </div>
          </ProgressRing>
          <div>
            <p className="font-display text-xl font-semibold">{p.levelTitle}</p>
            <p className="numeral text-2xl text-accent">{p.xp.toLocaleString()} XP</p>
            <p className="muted text-xs">{p.xpForLevel - p.xpIntoLevel} XP to next level</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-4">
          <Flame className="h-12 w-12 text-act" aria-hidden />
          <div>
            <p className="numeral text-4xl">{p.streak}</p>
            <p className="muted text-sm">day check-in streak</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-4">
          <ProgressRing value={readiness} size={90} stroke={8} color={readinessColor(readiness)} label={`Mission readiness ${readiness}`}>
            <p className="numeral text-2xl">{readiness}</p>
          </ProgressRing>
          <div>
            <p className="font-semibold">Mission readiness</p>
            <p className="muted text-xs">0–100 from body-system status, check-in consistency, sleep and exercise adherence.</p>
          </div>
        </Panel>
      </div>

      <h2 className="h2 mb-3 mt-8">Badges</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {p.badges.map((b, i) => {
          const Icon = ICONS[b.icon];
          return (
            <motion.li key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className={cn('panel flex items-center gap-4 p-4', b.earned ? 'border-monitor/40' : 'opacity-80')}>
              <span className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-2xl', b.earned ? 'bg-gradient-to-br from-monitor/30 to-act/20 text-monitor' : 'bg-white/5 text-slate-500')}>
                {b.earned ? <Icon className="h-7 w-7" aria-hidden /> : <Lock className="h-6 w-6" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {b.name} {b.earned && <span className="sr-only">(earned)</span>}
                </p>
                <p className="muted text-xs">{b.description}</p>
                {!b.earned && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(b.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.name} progress`}>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${b.progress * 100}%` }} />
                    </div>
                    <p className="muted mt-1 text-[11px]">{b.progressLabel}</p>
                  </div>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>

      <h2 className="h2 mb-3 mt-8 flex items-center gap-2">
        <Users className="h-5 w-5 text-accent" aria-hidden /> Weekly crew challenges
      </h2>
      <div className="grid gap-3 md:grid-cols-2" data-tour="challenges">
        {challenges.map((c) => {
          const pct = Math.min(100, (c.current / c.target) * 100);
          return (
            <Panel key={c.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-display font-semibold">{c.title}</p>
                <p className="numeral text-sm">
                  {c.current.toLocaleString()} / {c.target.toLocaleString()} {c.unit}
                </p>
              </div>
              <p className="muted mb-3 text-xs">{c.description}</p>
              <div className="h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.title} crew progress`}>
                <motion.div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-teal" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1 }} />
              </div>
              <p className="mt-1 text-xs">{pct >= 100 ? '🎉 Crew goal reached!' : `${Math.round(pct)}% together`}</p>
            </Panel>
          );
        })}
      </div>

      <Panel className="mt-8">
        <h2 className="eyebrow mb-2">How XP is earned</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-5">
          {p.breakdown.map((b) => (
            <li key={b.label} className="rounded-lg bg-white/5 p-2">
              <span className="muted block text-xs">{b.label}</span>
              <span className="numeral">{b.xp.toLocaleString()} XP</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
