import { useState } from 'react';
import { BookOpen, CheckSquare, ChevronDown, Clock, PhoneCall, Square } from 'lucide-react';
import type { Alert } from '@/types';
import { LEVEL_META } from '@/engine/status';
import { escalationPlan } from '@/engine/escalation';
import { useMissionContext } from '@/hooks/useMission';
import { GUIDANCE } from '@/data/guidance';
import { cn } from '@/utils';
import { HazardBadges, StatusBadge } from './ui';

/** Status → explanation (why) → action → escalation, in one card. */
export function AlertCard({ alert, defaultOpen = false, compact = false }: { alert: Alert; defaultOpen?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [done, setDone] = useState<Set<number>>(new Set());
  const { delaySec } = useMissionContext();
  const plan = escalationPlan(alert.level, delaySec, alert);
  const meta = LEVEL_META[alert.level];
  const showEscalation = alert.level === 'act' || alert.level === 'critical';

  return (
    <article className={cn('rounded-xl border bg-space-900/60', meta.border)} aria-label={`${meta.label}: ${alert.title}`}>
      <button
        className="focus-ring flex w-full items-start gap-3 rounded-xl p-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mt-0.5 h-9 w-1 shrink-0 rounded-full" style={{ background: meta.color }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="mb-1 flex flex-wrap items-center gap-2">
            <StatusBadge level={alert.level} size="sm" />
            {!compact && <HazardBadges ids={alert.hazards} compact />}
          </span>
          <span className="block font-semibold leading-snug">{alert.title}</span>
          <span className="muted mt-0.5 block text-sm">
            <span className="font-semibold text-slate-200">Why: </span>
            {alert.why[0]}
            {alert.why.length > 1 && !open && <span> (+{alert.why.length - 1} more)</span>}
          </span>
        </span>
        <ChevronDown className={cn('mt-1 h-5 w-5 shrink-0 text-slate-400 transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-4 border-t border-white/5 px-4 pb-4 pt-3 text-sm">
          {alert.why.length > 1 && (
            <section>
              <h3 className="eyebrow mb-1">Why VITALIS flagged this</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-slate-200">
                {alert.why.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}
          {showEscalation && (
            <section className={cn('rounded-lg border p-3', meta.border, meta.bg)}>
              <p className="flex items-start gap-2 font-semibold">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {plan.headline}
              </p>
            </section>
          )}
          <section>
            <h3 className="eyebrow mb-1.5">What to do now</h3>
            <ul className="space-y-1.5">
              {alert.actions.map((a, i) => {
                const checked = done.has(i);
                return (
                  <li key={a}>
                    <button
                      className="focus-ring flex min-h-[44px] w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/5"
                      aria-pressed={checked}
                      onClick={() => {
                        const n = new Set(done);
                        if (checked) n.delete(i);
                        else n.add(i);
                        setDone(n);
                      }}
                    >
                      {checked ? <CheckSquare className="mt-0.5 h-5 w-5 shrink-0 text-nominal" aria-hidden /> : <Square className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />}
                      <span className={cn(checked && 'text-slate-400 line-through')}>{a}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="flex items-start gap-2 rounded-lg bg-white/5 p-3">
            <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
            <p>
              <span className="font-semibold">Escalate when: </span>
              {alert.escalateWhen}
              {showEscalation && <span className="muted block text-xs">{plan.contact}</span>}
            </p>
          </section>
          {alert.guidanceIds.length > 0 && (
            <section className="flex flex-wrap gap-2">
              {alert.guidanceIds.map((g) =>
                GUIDANCE[g] ? (
                  <a key={g} href={`#/guidance/${g}`} className="chip focus-ring hover:border-accent hover:text-accent">
                    <BookOpen className="h-3.5 w-3.5" aria-hidden /> {GUIDANCE[g].title}
                  </a>
                ) : null,
              )}
            </section>
          )}
        </div>
      )}
    </article>
  );
}
