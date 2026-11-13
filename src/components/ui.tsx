import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Globe2,
  Info,
  Orbit,
  Radiation,
  UsersRound,
  Wind,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { HazardId, StatusLevel } from '@/types';
import { LEVEL_META } from '@/engine/status';
import { HAZARDS } from '@/data/hazards';
import { cn } from '@/utils';

export const LEVEL_ICON: Record<StatusLevel, LucideIcon> = {
  nominal: CheckCircle2,
  monitor: Eye,
  act: AlertTriangle,
  critical: AlertOctagon,
};

/** Status badge: colour + icon + text (never colour alone). */
export function StatusBadge({ level, size = 'md', short = false, className }: { level: StatusLevel; size?: 'sm' | 'md' | 'lg'; short?: boolean; className?: string }) {
  const m = LEVEL_META[level];
  const Icon = LEVEL_ICON[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold',
        m.bg,
        m.border,
        m.text,
        size === 'sm' && 'px-2 py-0.5 text-[11px]',
        size === 'md' && 'px-2.5 py-1 text-xs',
        size === 'lg' && 'px-3.5 py-1.5 text-sm',
        className,
      )}
    >
      <Icon aria-hidden className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      {short ? m.short : m.label}
    </span>
  );
}

const HAZARD_ICON: Record<HazardId, LucideIcon> = {
  radiation: Radiation,
  isolation: UsersRound,
  distance: Globe2,
  gravity: Orbit,
  environment: Wind,
};

export function HazardIcon({ id, className }: { id: HazardId; className?: string }) {
  const Icon = HAZARD_ICON[id];
  return <Icon aria-hidden className={className} style={{ color: HAZARDS[id].color }} />;
}

export function HazardBadges({ ids, compact = false }: { ids: HazardId[]; compact?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5" aria-label={`NASA hazards: ${ids.map((i) => HAZARDS[i].name).join(', ')}`}>
      {[...new Set(ids)].map((id) => (
        <span
          key={id}
          className="chip"
          title={`${HAZARDS[id].name}: ${HAZARDS[id].description}`}
          style={{ borderColor: `${HAZARDS[id].color}55` }}
        >
          <HazardIcon id={id} className="h-3.5 w-3.5" />
          {!compact && <span>{HAZARDS[id].short}</span>}
        </span>
      ))}
    </span>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1 max-w-2xl text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn('panel panel-pad', className)} {...rest}>
      {children}
    </As>
  );
}

export function Sparkline({ values, color = '#22d3ee', width = 96, height = 28, label }: { values: number[]; color?: string; width?: number; height?: number; label?: string }) {
  if (values.length < 2) return <span className="muted text-xs">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  const last = pts.split(' ').pop()!.split(',');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? 'trend sparkline'} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill={color} />
    </svg>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-xs muted', className)}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Decision support, not diagnosis. VITALIS never replaces your Crew Medical Officer or flight surgeon. If in doubt, escalate.
      </span>
    </p>
  );
}

/** Accessible side drawer / modal. */
export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'right',
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: 'right' | 'center';
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} tabIndex={-1} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={cn(
              'panel relative z-10 flex max-h-full flex-col overflow-hidden outline-none',
              side === 'right' ? 'ml-auto h-full w-full rounded-none sm:rounded-l-2xl' : 'm-auto max-h-[90vh] w-[min(640px,94vw)]',
              side === 'right' && (wide ? 'sm:w-[640px]' : 'sm:w-[480px]'),
            )}
            initial={side === 'right' ? { x: 60, opacity: 0 } : { scale: 0.96, opacity: 0 }}
            animate={side === 'right' ? { x: 0, opacity: 1 } : { scale: 1, opacity: 1 }}
            exit={side === 'right' ? { x: 60, opacity: 0 } : { scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <h2 className="h2">{title}</h2>
              <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Close panel">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ProgressRing({ value, size = 120, stroke = 10, color = '#22d3ee', children, label }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(100, value)) / 100) }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon className="h-10 w-10 text-accent/70" aria-hidden />
      <p className="font-semibold">{title}</p>
      {body && <p className="muted max-w-sm text-sm">{body}</p>}
      {action}
    </div>
  );
}

export function readinessColor(v: number): string {
  if (v >= 85) return LEVEL_META.nominal.color;
  if (v >= 70) return LEVEL_META.monitor.color;
  if (v >= 50) return LEVEL_META.act.color;
  return LEVEL_META.critical.color;
}

/** Renders children only once scrolled near the viewport (keeps chart-heavy pages fast). */
export function LazyMount({ children, height }: { children: ReactNode; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (shown || !ref.current) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setShown(true), { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return <div ref={ref} style={shown ? undefined : { minHeight: height }}>{shown ? children : null}</div>;
}
