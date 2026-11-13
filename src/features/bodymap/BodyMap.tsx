import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import type { StatusLevel, SystemId } from '@/types';
import { LEVEL_META, rank } from '@/engine/status';
import { SYSTEMS } from '@/data/systems';
import { cn } from '@/utils';

type View = 'front' | 'back';

interface Props {
  levels: Record<SystemId, StatusLevel>;
  heartRate?: number;
  selected?: SystemId | null;
  onSelect: (id: SystemId) => void;
  emphasized?: SystemId[];
}

/** Silhouette paths (viewBox 0 0 200 440). Shared by both views. */
const BODY =
  'M100 8c15 0 27 12 27 30 0 11-4 20-10 25v8c0 4 3 6 7 7l18 5c10 3 15 10 16 20l6 52 8 48c1 6-1 9-5 9-3 0-5-2-6-6l-10-46-6-38-3 4-2 50 6 40 6 60 3 72c0 6-3 9-8 9h-10c-4 0-6-3-6-7l-1-66-6-56-6 0-6 56-1 66c0 4-2 7-6 7H86c-5 0-8-3-8-9l3-72 6-60 6-40-2-50-3-4-6 38-10 46c-1 4-3 6-6 6-4 0-6-3-5-9l8-48 6-52c1-10 6-17 16-20l18-5c4-1 7-3 7-7v-8c-6-5-10-14-10-25 0-18 12-30 27-30z';

interface RegionProps {
  id: SystemId;
  level: StatusLevel;
  selected: boolean;
  onSelect: (id: SystemId) => void;
  children: ReactNode;
  emphasized: boolean;
}

function Region({ id, level, selected, onSelect, children, emphasized }: RegionProps) {
  const meta = LEVEL_META[level];
  const sys = SYSTEMS[id];
  const flagged = rank(level) >= 1;
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    }
  };
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${sys.name}: ${meta.label}${emphasized ? ' (emphasized for this mission)' : ''}`}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
      onKeyDown={onKey}
      className="cursor-pointer outline-none [&:focus-visible>.region-shape]:stroke-white [&:hover>.region-shape]:opacity-100"
      style={{ color: meta.color }}
    >
      <title>{`${sys.name}: ${meta.label}`}</title>
      {flagged && (
        <g className="glow-pulse" filter="url(#glow)" aria-hidden>
          {children}
        </g>
      )}
      <g
        className="region-shape transition-opacity"
        fill="currentColor"
        fillOpacity={selected ? 0.75 : flagged ? 0.55 : 0.28}
        stroke="currentColor"
        strokeWidth={selected ? 2.2 : 1.2}
        opacity={selected ? 1 : 0.9}
      >
        {children}
      </g>
    </g>
  );
}

export function BodyMap({ levels, heartRate = 60, selected = null, onSelect, emphasized = [] }: Props) {
  const [view, setView] = useState<View>('front');
  const beat = Math.max(0.35, 60 / Math.max(30, heartRate));
  const r = (id: SystemId, children: ReactNode) => (
    <Region id={id} level={levels[id]} selected={selected === id} onSelect={onSelect} emphasized={emphasized.includes(id)}>
      {children}
    </Region>
  );

  return (
    <div className="relative flex flex-col items-center">
      <div className="mb-2 flex w-full items-center justify-between">
        <div role="tablist" aria-label="Body view" className="flex rounded-xl border border-white/10 bg-white/5 p-0.5">
          {(['front', 'back'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn('focus-ring h-9 rounded-lg px-3 text-xs font-semibold capitalize', view === v ? 'bg-accent text-space-950' : 'text-slate-300')}
            >
              {v}
            </button>
          ))}
        </div>
        <button className="focus-ring flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-slate-300 hover:text-white" onClick={() => setView(view === 'front' ? 'back' : 'front')} aria-label="Flip body view">
          <RotateCcw className="h-4 w-4" aria-hidden /> Flip
        </button>
      </div>
      <motion.svg
        key={view}
        viewBox="0 0 200 440"
        className="h-[min(62vh,520px)] w-auto max-w-full"
        role="group"
        aria-label={`Interactive body map, ${view} view. Select a body system for details.`}
        initial={{ rotateY: 80, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
            </feMerge>
          </filter>
          <linearGradient id="bodyFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0.10" />
            <stop offset="1" stopColor="#2dd4bf" stopOpacity="0.04" />
          </linearGradient>
          <pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M8 0H0V8" fill="none" stroke="#22d3ee" strokeOpacity="0.07" strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Skin = whole silhouette */}
        {r(
          'skin',
          <path d={BODY} />,
        )}
        <path d={BODY} fill="url(#grid)" pointerEvents="none" />
        <path d={BODY} fill="url(#bodyFill)" stroke="#67e8f9" strokeOpacity="0.35" strokeWidth="1" pointerEvents="none" />

        {view === 'front' ? (
          <>
            {r('behavioral', <path d="M80 26c3-10 11-15 20-15s17 5 20 15c-6-3-13-4-20-4s-14 1-20 4z" />)}
            {r(
              'sans',
              <>
                <ellipse cx="90" cy="38" rx="7" ry="4.5" />
                <ellipse cx="110" cy="38" rx="7" ry="4.5" />
              </>,
            )}
            {r(
              'lungs',
              <>
                <path d="M96 92c-3 0-16 4-19 14-3 12-3 30 0 40 2 5 8 6 13 4 5-2 6-6 6-12z" />
                <path d="M104 92c3 0 16 4 19 14 3 12 3 30 0 40-2 5-8 6-13 4-5-2-6-6-6-12z" />
              </>,
            )}
            {r('gi', <path d="M86 160c2-6 10-8 18-7 10 1 16 7 15 15-1 7-6 10-10 15-4 6-2 14-10 16-7 2-13-3-14-10-1-6 4-10 3-16 0-5-3-8-2-13z" />)}
            {r(
              'immune',
              <>
                <circle cx="88" cy="70" r="3" />
                <circle cx="112" cy="70" r="3" />
                <circle cx="70" cy="100" r="3.2" />
                <circle cx="130" cy="100" r="3.2" />
                <ellipse cx="126" cy="160" rx="5" ry="8" />
                <circle cx="84" cy="222" r="3" />
                <circle cx="116" cy="222" r="3" />
              </>,
            )}
            {r(
              'musculoskeletal',
              <>
                <path d="M84 238h14l-2 60-4 46h-8l-2-46z" />
                <path d="M102 238h14l2 60-2 46h-8l-4-46z" />
                <circle cx="91" cy="312" r="5" />
                <circle cx="109" cy="312" r="5" />
              </>,
            )}
            {/* Heart: pulses at the current heart rate */}
            <g transform="translate(106 116)">
              <motion.g
                animate={{ scale: [1, 1.22, 1, 1.08, 1] }}
                transition={{ duration: beat, repeat: Infinity, ease: 'easeInOut' }}
                style={{ originX: '0px', originY: '0px' }}
              >
                {r('cardio', <path d="M0 6c-6-5-12-9-12-15 0-4 3-7 7-7 3 0 4 2 5 4 1-2 2-4 5-4 4 0 7 3 7 7 0 6-6 10-12 15z" />)}
              </motion.g>
            </g>
          </>
        ) : (
          <>
            {r('behavioral', <path d="M78 30c0-14 10-22 22-22s22 8 22 22c0 10-6 16-22 16S78 40 78 30z" />)}
            {r(
              'sans',
              <path d="M88 46c4 6 8 8 12 8s8-2 12-8c-4 2-8 3-12 3s-8-1-12-3z" />,
            )}
            {r(
              'lungs',
              <>
                <path d="M94 94c-4 0-14 5-16 14-2 12-2 26 1 34 2 4 7 5 11 3 4-2 5-5 5-10z" />
                <path d="M106 94c4 0 14 5 16 14 2 12 2 26-1 34-2 4-7 5-11 3-4-2-5-5-5-10z" />
              </>,
            )}
            {r(
              'gi',
              <>
                <ellipse cx="88" cy="176" rx="5" ry="8" />
                <ellipse cx="112" cy="176" rx="5" ry="8" />
              </>,
            )}
            {r(
              'musculoskeletal',
              <>
                {Array.from({ length: 15 }, (_, i) => (
                  <rect key={i} x="96" y={74 + i * 9.5} width="8" height="7" rx="2" />
                ))}
                <path d="M80 214c6-6 14-8 20-8s14 2 20 8l-4 18c-5-3-10-4-16-4s-11 1-16 4z" />
                <path d="M84 238h14l-2 60-4 46h-8l-2-46z" />
                <path d="M102 238h14l2 60-2 46h-8l-4-46z" />
              </>,
            )}
            {r(
              'immune',
              <>
                <ellipse cx="74" cy="150" rx="5" ry="8" />
                <circle cx="70" cy="100" r="3.2" />
                <circle cx="130" cy="100" r="3.2" />
              </>,
            )}
          </>
        )}
      </motion.svg>
      <p className="muted mt-1 text-center text-xs">
        {view === 'front' ? 'Front view: heart pulses at your latest resting HR' : 'Back view: spine, brain and kidneys'} · Tap a glowing region
      </p>
    </div>
  );
}
