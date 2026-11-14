import { motion } from 'framer-motion';
import { AlertOctagon, AlertTriangle, Eye, HeartHandshake, ShieldAlert, Volume2 } from 'lucide-react';
import type { TriageResult } from '@/types';
import { LEVEL_META } from '@/engine/status';
import { useApp } from '@/store/useApp';
import { alertSound } from '@/utils/sound';
import { cn } from '@/utils';

/** Big, plain-language "how am I today?" banner at the top of the dashboard. */
export function StatusBanner({ triage, name }: { triage: TriageResult; name: string }) {
  const setCalm = useApp((s) => s.setCalm);
  const lvl = triage.overall;
  const m = LEVEL_META[lvl];
  const top = triage.alerts[0];
  const watch = triage.alerts.filter((a) => a.level === 'monitor').length;

  const content = {
    nominal: { Icon: HeartHandshake, title: `You're doing well today, ${name} 💚`, body: 'Everything looks normal for you. Keep up your exercise, water and sleep.' },
    monitor: { Icon: Eye, title: 'Mostly good today', body: `${watch} small thing${watch === 1 ? '' : 's'} to keep an eye on${top ? `: ${top.title.toLowerCase()}` : ''}.` },
    act: { Icon: AlertTriangle, title: 'Take action today', body: top ? `${top.title}. Tap the alert below to see what to do.` : m.description },
    critical: { Icon: AlertOctagon, title: 'Get medical help now', body: top ? `${top.title}. Start the checklist and tell your crew medical officer.` : m.description },
  }[lvl];

  return (
    <motion.section
      role={lvl === 'critical' ? 'alert' : 'status'}
      aria-live={lvl === 'critical' ? 'assertive' : 'polite'}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('relative mb-5 overflow-hidden rounded-2xl border-2 p-4 sm:p-5', m.border, m.bg)}
      data-tour="status-banner"
    >
      {lvl === 'critical' && <span className="glow-pulse pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-critical/60" aria-hidden />}
      <div className="relative flex flex-wrap items-center gap-4">
        <motion.span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-black/30"
          animate={lvl === 'critical' ? { scale: [1, 1.12, 1] } : lvl === 'nominal' ? { scale: [1, 1.05, 1] } : undefined}
          transition={{ duration: lvl === 'critical' ? 0.9 : 2.4, repeat: Infinity }}
        >
          <content.Icon className="h-8 w-8" style={{ color: m.color }} aria-hidden />
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-bold sm:text-2xl" style={{ color: m.color }}>
            {content.title}
          </p>
          <p className="text-sm text-slate-100 sm:text-base">{content.body}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lvl === 'critical' && (
            <button className="btn-danger" onClick={() => setCalm(true)}>
              <ShieldAlert className="h-5 w-5" aria-hidden /> Show me what to do
            </button>
          )}
          {(lvl === 'critical' || lvl === 'act') && (
            <button className="btn-ghost" onClick={() => alertSound(lvl === 'critical' ? 'critical' : 'act')} aria-label="Play the alert sound again">
              <Volume2 className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
