import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, Megaphone, Square, X } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { useMissionContext, useTriage } from '@/hooks/useMission';
import { escalationPlan } from '@/engine/escalation';
import { GUIDANCE } from '@/data/guidance';
import { LEVEL_META, rank } from '@/engine/status';
import { cn } from '@/utils';

/** Emergency "calm mode": strips the UI down to one big checklist. */
export function CalmMode() {
  const setCalm = useApp((s) => s.setCalm);
  const toast = useApp((s) => s.toast);
  const triage = useTriage();
  const { delaySec } = useMissionContext();
  const ref = useRef<HTMLDivElement>(null);
  const top = triage?.alerts.find((a) => rank(a.level) >= 2);
  const steps = top?.actions ?? GUIDANCE['emergency-cardio'].steps;
  const title = top?.title ?? 'Medical emergency checklist';
  const level = top?.level ?? 'critical';
  const plan = escalationPlan(level, delaySec, top);
  const [done, setDone] = useState<Set<number>>(new Set());

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCalm(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCalm]);

  return createPortal(
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Calm mode" className="fixed inset-0 z-[80] overflow-y-auto bg-black text-white outline-none">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col px-5 py-6 sm:py-10">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em]" style={{ color: LEVEL_META[level].color }}>
              Calm mode · {LEVEL_META[level].label}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{title}</h1>
          </div>
          <button className="btn-icon btn-ghost h-14 w-14 shrink-0 border-2 border-white" onClick={() => setCalm(false)} aria-label="Exit calm mode">
            <X className="h-7 w-7" />
          </button>
        </div>
        <p className="mb-6 rounded-2xl border-2 border-white/80 p-4 text-lg font-semibold">Breathe. You are trained for this. {plan.headline}</p>
        <ol className="space-y-3">
          {steps.map((s, i) => {
            const on = done.has(i);
            return (
              <li key={s}>
                <button
                  className={cn('focus-ring flex min-h-[72px] w-full items-center gap-4 rounded-2xl border-2 p-4 text-left text-xl', on ? 'border-nominal bg-nominal/15 text-slate-300' : 'border-white bg-white/5')}
                  aria-pressed={on}
                  onClick={() => {
                    const n = new Set(done);
                    if (on) n.delete(i);
                    else n.add(i);
                    setDone(n);
                  }}
                >
                  <span className="numeral w-8 shrink-0 text-2xl">{i + 1}</span>
                  <span className={cn('flex-1', on && 'line-through')}>{s}</span>
                  {on ? <CheckSquare className="h-9 w-9 shrink-0 text-nominal" aria-hidden /> : <Square className="h-9 w-9 shrink-0" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-center text-lg" aria-live="polite">
          {done.size} of {steps.length} done
        </p>
        <div className="mt-auto grid gap-3 pt-8 sm:grid-cols-2">
          <button className="btn btn-lg bg-yellow-300 text-black" onClick={() => toast({ title: 'CMO and crew alerted', body: 'Crew alarm sent on the intercom', level: 'critical' })}>
            <Megaphone className="h-6 w-6" aria-hidden /> Alert CMO & crew
          </button>
          <button
            className="btn btn-lg border-2 border-white"
            onClick={() => {
              setCalm(false);
              window.location.hash = '#/ground';
            }}
          >
            Send health packet to ground
          </button>
        </div>
        <p className="mt-4 text-center text-sm text-slate-300">{top ? `Escalate when: ${top.escalateWhen}` : 'If in doubt, escalate.'}</p>
      </div>
    </div>,
    document.body,
  );
}
