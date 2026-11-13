import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Pause, Play, X } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { navigate } from '@/hooks/useRoute';
import type { Role } from '@/types';

interface Step {
  route: string;
  target?: string;
  title: string;
  body: string;
  role?: Role;
}

/** ~60-second guided tour for judges. Auto-advances every 6.5 s. */
const STEPS: Step[] = [
  { route: 'dashboard', target: 'delay', title: '20 minutes from help', body: 'On a Mars mission, Earth is 4–22 light-minutes away. VITALIS turns readings into status → explanation → action → escalation, fully offline. This is a seeded 90-day Mars transit.' },
  { route: 'dashboard', target: 'bodymap', title: 'Interactive body map', body: 'Each system is coloured by status. The heart pulses at your latest resting HR. Commander ORION’s eyes and heart glow: a SANS cluster was detected today.' },
  { route: 'dashboard', target: 'alerts', title: 'Explainable alerts', body: '“Systolic BP 10% above YOUR baseline, rising 1.5 mmHg/day, plus headache and vision change.” Every alert shows why, a checklist, and when to escalate, timed to the comm delay.' },
  { route: 'dashboard', target: 'readiness', title: 'Mission readiness 0–100', body: 'A transparent score from body-system status, check-in consistency, sleep and exercise adherence.' },
  { route: 'checkin', title: 'Under-3-minute check-in', body: 'Big, glove-friendly controls with live status, “How to measure in space” help for every indicator, and an experimental camera heart-rate (rPPG).' },
  { route: 'trends', target: 'insights', title: 'Trends that know YOU', body: 'Green = normal range, violet = your personal 14-day baseline. Event markers (solar storm, EVA) and correlation insights like “<6 h sleep → 25% slower reactions”.' },
  { route: 'crew', target: 'crew-cards', title: 'Crew Medical Officer view', body: 'The CMO sees all 4 crew at a glance: ATLAS’s bone-loss proxy, NOVA’s recovered mood decline after intervention, and a severity-sorted alert queue.', role: 'cmo' },
  { route: 'ground', target: 'ground', title: 'Ground link with real delay', body: 'Send a compressed health packet plus a one-page PDF. It arrives after the light-time delay, and a flight-surgeon reply follows. Nothing leaves the device unless you tap Send.', role: 'astronaut' },
  { route: 'achievements', target: 'challenges', title: 'Crew-positive motivation', body: 'XP, streaks and badges for healthy habits, plus cooperative crew challenges. Never a leaderboard of anyone’s health data.' },
  { route: 'dashboard', target: 'assistant', title: 'Assistant + Calm Mode', body: 'Ask the assistant to explain your data (offline rule engine; optional AI layer). The red shield opens Calm Mode: one big emergency checklist. Tour complete!' },
];

const DWELL = 6500;

export default function Tour() {
  const setTour = useApp((s) => s.setTour);
  const setRole = useApp((s) => s.setRole);
  const updateSettings = useApp((s) => s.updateSettings);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i];

  const close = useCallback(() => {
    setTour(false);
    void updateSettings({ tourSeen: true });
    navigate('dashboard');
  }, [setTour, updateSettings]);

  useEffect(() => {
    if (step.role) setRole(step.role);
    navigate(step.route);
  }, [step, setRole]);

  useLayoutEffect(() => {
    setRect(null);
    if (!step.target) return;
    let tries = 0;
    const find = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
        el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'smooth' });
        setTimeout(() => setRect(el.getBoundingClientRect()), 350);
      } else if (tries++ < 20) setTimeout(find, 100);
    };
    find();
    const onResize = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [step]);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => (i < STEPS.length - 1 ? setI(i + 1) : setPlaying(false)), DWELL);
    return () => clearTimeout(t);
  }, [i, playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') setI((x) => Math.min(STEPS.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const pad = 8;
  const vh = window.innerHeight;
  const placement: React.CSSProperties = !rect
    ? { bottom: 96 }
    : vh - rect.bottom > 250
      ? { top: rect.bottom + 16 }
      : rect.top > 250
        ? { bottom: vh - rect.top + 16 }
        : { bottom: 24 };

  return createPortal(
    <div className="fixed inset-0 z-[90]" aria-live="polite">
      {rect ? (
        <motion.div
          className="pointer-events-none fixed rounded-2xl border-2 border-accent"
          style={{ boxShadow: '0 0 0 9999px rgba(3,6,15,.72), 0 0 30px rgba(34,211,238,.6)' }}
          animate={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-space-950/60" />
      )}
      <motion.div
        key={i}
        role="dialog"
        aria-label={`Guided tour step ${i + 1} of ${STEPS.length}: ${step.title}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel fixed left-1/2 w-[min(440px,92vw)] -translate-x-1/2 border-accent/50 p-5"
        style={placement}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="eyebrow text-accent">
            Guided tour · {i + 1}/{STEPS.length}
          </p>
          <button className="text-xs text-slate-300 underline-offset-2 hover:underline" onClick={close}>
            Skip tour
          </button>
        </div>
        <h2 className="h2 mb-1">{step.title}</h2>
        <p className="text-sm leading-relaxed text-slate-200">{step.body}</p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
          <motion.div key={`${i}-${playing}`} className="h-full bg-accent" initial={{ width: '0%' }} animate={{ width: playing ? '100%' : '0%' }} transition={{ duration: playing ? DWELL / 1000 : 0, ease: 'linear' }} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button className="btn-ghost" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} aria-label="Previous step">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button className="btn-ghost" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause tour' : 'Play tour'}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          {i < STEPS.length - 1 ? (
            <button className="btn-primary flex-1" onClick={() => setI(i + 1)}>
              Next <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button className="btn-primary flex-1" onClick={close}>
              Finish
            </button>
          )}
          <button className="btn-icon btn-ghost" onClick={close} aria-label="Close tour">
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
