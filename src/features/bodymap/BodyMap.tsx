import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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

type Pt = [number, number];
/**
 * Right half of the body outline (viewBox 0 0 200 440), from the top of the head down the
 * outside of the arm and leg and back up the inside of the leg. Each step is a cubic curve
 * [control 1, control 2, end]. The left half is the exact mirror, so the body is symmetric.
 */
const RIGHT_HALF: [Pt, Pt, Pt][] = [
  [[116, 8], [127, 20], [127, 36]], // head
  [[127, 48], [122, 58], [115, 63]], // jaw
  [[114, 66], [113, 69], [113, 72]], // neck
  [[114, 77], [124, 80], [136, 83]], // shoulder
  [[148, 86], [156, 92], [157, 104]], // shoulder cap
  [[159, 124], [161, 146], [163, 168]], // upper arm
  [[166, 192], [168, 212], [170, 232]], // forearm
  [[172, 242], [172, 252], [166, 256]], // hand
  [[160, 258], [157, 252], [157, 244]],
  [[155, 226], [152, 206], [149, 186]], // inner forearm
  [[147, 166], [145, 140], [141, 118]], // inner upper arm to armpit
  [[138, 130], [134, 150], [128, 170]], // side to waist
  [[126, 184], [128, 200], [127, 214]], // hip
  [[126, 236], [124, 262], [122, 290]], // thigh
  [[121, 310], [120, 326], [119, 338]], // knee
  [[121, 356], [120, 380], [117, 404]], // calf
  [[116, 410], [116, 414], [116, 418]], // ankle
  [[118, 424], [122, 428], [121, 432]], // foot
  [[115, 432], [109, 432], [104, 432]],
  [[103, 424], [104, 416], [104, 408]],
  [[104, 380], [106, 356], [104, 338]], // inner knee
  [[103, 320], [103, 296], [102, 266]], // inner thigh
  [[101, 252], [101, 244], [100, 240]], // crotch
];

function bodyPath(): string {
  const f = (n: number) => +n.toFixed(1);
  const m = ([x, y]: Pt): Pt => [200 - x, y];
  let d = 'M100 8';
  for (const [c1, c2, e] of RIGHT_HALF) d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(e[0])} ${f(e[1])}`;
  // Walk the mirrored half back to the top: reverse each curve (end ← c2 ← c1 ← start).
  const starts: Pt[] = [[100, 8], ...RIGHT_HALF.map((sg) => sg[2])];
  for (let i = RIGHT_HALF.length - 1; i >= 0; i--) {
    const [c1, c2] = RIGHT_HALF[i];
    const [a, b, e] = [m(c2), m(c1), m(starts[i])];
    d += `C${f(a[0])} ${f(a[1])} ${f(b[0])} ${f(b[1])} ${f(e[0])} ${f(e[1])}`;
  }
  return d + 'Z';
}

/** Body outline, shared by both views. */
const BODY = bodyPath();

/** Organ colours: light (highlight), base, dark (shadow) for a 3D shaded look. */
const PAL = {
  brain: ['#fde2ef', '#f2a6c8', '#a8487a'],
  eye: ['#ffffff', '#e2e8f0', '#94a3b8'],
  lung: ['#ffd1d8', '#f08a9b', '#9b3348'],
  heart: ['#ff9a9a', '#d92b2b', '#6e0f12'],
  liver: ['#e3866a', '#9c3b22', '#4d160b'],
  stomach: ['#ffd9c2', '#eea07a', '#9c5536'],
  gut: ['#ffe0cc', '#e5a184', '#9a5a45'],
  colon: ['#f6c39f', '#c97b56', '#7a3f27'],
  kidney: ['#f59aa8', '#b8334f', '#5e0f22'],
  bladder: ['#fff1b8', '#f2cf5b', '#9a7a12'],
  spleen: ['#d8b4fe', '#9b5de5', '#4c1d95'],
  lymph: ['#bbf7d0', '#4ade80', '#166534'],
  bone: ['#ffffff', '#e7e2d6', '#9c937f'],
  vessel: ['#fca5a5', '#ef4444', '#7f1d1d'],
} as const;
type Organ = keyof typeof PAL;

interface RegionProps {
  id: SystemId;
  level: StatusLevel;
  selected: boolean;
  onSelect: (id: SystemId) => void;
  children: ReactNode;
  emphasized: boolean;
  /** Where the "needs attention" marker sits. */
  marker?: [number, number];
}

/**
 * A clickable body system. Organs keep their natural colours; the status shows as a coloured
 * outline + glow + a "!" marker (never colour alone), and in the label read by screen readers.
 */
function Region({ id, level, selected, onSelect, children, emphasized, marker }: RegionProps) {
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
      aria-label={`${sys.name}: ${meta.label}${emphasized ? ' (important on this mission)' : ''}`}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
      onKeyDown={onKey}
      className="group cursor-pointer outline-none"
      style={{ color: meta.color }}
    >
      <title>{`${sys.name}: ${meta.label}`}</title>
      {flagged && (
        <g className="glow-pulse [&_*]:!fill-current [&_*]:!stroke-current" filter="url(#bm-glow)" aria-hidden>
          {children}
        </g>
      )}
      {children}
      {/* Status outline: always for flagged/selected areas, on hover/focus for the rest. */}
      <g
        aria-hidden
        className={cn(
          '[&_*]:!fill-transparent [&_*]:!stroke-current transition-opacity',
          selected ? 'opacity-100 [&_*]:![stroke-width:2.4px] [&_*]:!stroke-white' : flagged ? 'opacity-100 [&_*]:![stroke-width:1.8px]' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [&_*]:![stroke-width:1.4px]',
        )}
      >
        {children}
      </g>
      {flagged && marker && (
        <g transform={`translate(${marker[0]} ${marker[1]})`} aria-hidden>
          <circle r="5.5" fill={meta.color} stroke="#0b1020" strokeWidth="1.2" />
          <text y="2.6" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#0b1020">
            !
          </text>
        </g>
      )}
    </g>
  );
}

function Gradients({ p }: { p: string }) {
  return (
    <>
      {(Object.keys(PAL) as Organ[]).map((k) => (
        <radialGradient key={k} id={`${p}-${k}`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor={PAL[k][0]} />
          <stop offset="0.45" stopColor={PAL[k][1]} />
          <stop offset="1" stopColor={PAL[k][2]} />
        </radialGradient>
      ))}
    </>
  );
}

export function BodyMap({ levels, heartRate = 60, selected = null, onSelect, emphasized = [] }: Props) {
  const [view, setView] = useState<View>('front');
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const p = `bm${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const g = (o: Organ) => `url(#${p}-${o})`;
  const beat = Math.max(0.35, 60 / Math.max(30, heartRate));
  const r = (id: SystemId, children: ReactNode, marker?: [number, number]) => (
    <Region id={id} level={levels[id]} selected={selected === id} onSelect={onSelect} emphasized={emphasized.includes(id)} marker={marker}>
      {children}
    </Region>
  );

  // Gentle 3D tilt that follows the pointer (off with "reduce motion").
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType === 'touch' || !box.current) return;
    const b = box.current.getBoundingClientRect();
    setTilt({ x: ((e.clientY - b.top) / b.height - 0.5) * -10, y: ((e.clientX - b.left) / b.width - 0.5) * 16 });
  };

  const bone = { fill: g('bone'), stroke: '#8a826e', strokeWidth: 0.5 } as const;

  // Skeleton shared by both views (drawn faintly behind the organs).
  const boneLine = (x1: number, y1: number, x2: number, y2: number, w: number) => (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8a826e" strokeWidth={w + 1} strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={g('bone')} strokeWidth={w} strokeLinecap="round" />
    </>
  );
  const legBones = (
    <>
      {/* Arms: upper arm, forearm (both sides) */}
      {boneLine(150, 102, 154, 168, 4.5)}
      {boneLine(50, 102, 46, 168, 4.5)}
      {boneLine(156, 178, 162, 234, 3.6)}
      {boneLine(44, 178, 38, 234, 3.6)}
      {/* Legs: thigh bone, kneecap, shin bone */}
      {boneLine(112, 244, 111, 326, 6)}
      {boneLine(88, 244, 89, 326, 6)}
      <circle cx="111" cy="332" r="4.6" {...bone} />
      <circle cx="89" cy="332" r="4.6" {...bone} />
      {boneLine(111, 340, 111, 414, 4.8)}
      {boneLine(89, 340, 89, 414, 4.8)}
    </>
  );
  const pelvis = <path d="M78 214c8-8 16-10 22-10s14 2 22 10l-3 16c-3 6-8 8-12 8l-7-6-7 6c-4 0-9-2-12-8z" {...bone} />;

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
        <button className="focus-ring flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-slate-300 hover:text-white" onClick={() => setView(view === 'front' ? 'back' : 'front')} aria-label="Turn the body around">
          <RotateCcw className="h-4 w-4" aria-hidden /> Turn around
        </button>
      </div>
      <div ref={box} className="w-full" style={{ perspective: 900 }} onPointerMove={onMove} onPointerLeave={() => setTilt({ x: 0, y: 0 })}>
        <motion.svg
          key={view}
          viewBox="0 0 200 440"
          className="mx-auto block h-[min(62vh,520px)] w-auto max-w-full"
          role="group"
          aria-label={`Body map, ${view} view, showing the organs. Select a body area for details.`}
          initial={reduce ? false : { rotateY: 80, opacity: 0 }}
          animate={{ rotateY: tilt.y, rotateX: tilt.x, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        >
          <defs>
            <filter id="bm-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="b" />
              </feMerge>
            </filter>
            <filter id={`${p}-depth`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="1.2" dy="2" stdDeviation="1.4" floodColor="#000" floodOpacity="0.55" />
            </filter>
            {/* Glass-like body lit from the top left. */}
            <radialGradient id={`${p}-skin`} cx="38%" cy="22%" r="85%">
              <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.30" />
              <stop offset="0.55" stopColor="#22d3ee" stopOpacity="0.12" />
              <stop offset="1" stopColor="#0e7490" stopOpacity="0.22" />
            </radialGradient>
            <linearGradient id={`${p}-rim`} x1="0" x2="1">
              <stop offset="0" stopColor="#a5f3fc" stopOpacity="0.9" />
              <stop offset="0.5" stopColor="#67e8f9" stopOpacity="0.25" />
              <stop offset="1" stopColor="#a5f3fc" stopOpacity="0.7" />
            </linearGradient>
            <Gradients p={p} />
          </defs>

          {/* Floor shadow */}
          <ellipse cx="100" cy="435" rx="40" ry="4.5" fill="#000" opacity="0.45" />

          {/* Skin (the whole body) */}
          {r(
            'skin',
            <path d={BODY} fill={`url(#${p}-skin)`} stroke={`url(#${p}-rim)`} strokeWidth="1.2" />,
            [140, 60],
          )}

          {view === 'front' ? (
            <g filter={`url(#${p}-depth)`}>
              {/* Bones & muscles: clavicles, ribs, pelvis, arm and leg bones */}
              {r(
                'musculoskeletal',
                <>
                  <path d="M76 82c8 3 16 4 22 3M124 82c-8 3-16 4-22 3" fill="none" stroke={g('bone')} strokeWidth="3" strokeLinecap="round" />
                  {[96, 106, 116, 126, 136].map((y, i) => (
                    <path key={y} d={`M99 ${y}c-10-2-20 2-25 ${10 + i}M101 ${y}c10-2 20 2 25 ${10 + i}`} fill="none" stroke={g('bone')} strokeWidth="2" strokeLinecap="round" opacity="0.75" />
                  ))}
                  <rect x="98" y="88" width="4" height="56" rx="2" {...bone} />
                  {pelvis}
                  {legBones}
                </>,
                [92, 300],
              )}

              {/* Lungs + windpipe */}
              {r(
                'lungs',
                <>
                  <path d="M98.5 62h3v28h-3z" fill={g('bone')} stroke="#8a826e" strokeWidth="0.4" />
                  <path d="M100 88l-8 8M100 88l8 8" stroke={g('bone')} strokeWidth="2.4" strokeLinecap="round" />
                  <path d="M95 94c-8-3-17 2-20 13-3 13-3 29 1 39 3 6 10 7 16 4 4-2 5-6 5-12z" fill={g('lung')} />
                  <path d="M105 94c8-3 17 2 20 13 3 13 3 29-1 39-3 6-9 7-14 4-3-2-4-5-4-9 2-6 3-9 0-13z" fill={g('lung')} />
                </>,
                [72, 104],
              )}

              {/* Immune: thymus, spleen, lymph nodes */}
              {r(
                'immune',
                <>
                  <path d="M97 90c0-4 2-6 3-6s3 2 3 6c0 4-1 7-3 7s-3-3-3-7z" fill={g('lymph')} />
                  <ellipse cx="127" cy="160" rx="4.5" ry="8" transform="rotate(-20 127 160)" fill={g('spleen')} />
                  {[
                    [90, 68],
                    [110, 68],
                    [71, 100],
                    [129, 100],
                    [86, 226],
                    [114, 226],
                  ].map(([x, y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill={g('lymph')} />
                  ))}
                </>,
                [134, 150],
              )}

              {/* Stomach & food: liver, stomach, intestines, bladder */}
              {r(
                'gi',
                <>
                  <path d="M75 150c10-6 28-6 36 0 1 6-4 12-12 16-9 4-17 6-21 4-3-3-4-11-3-20z" fill={g('liver')} />
                  <path d="M109 152c7-5 15-3 17 4 2 8-2 16-10 19-6 2-12 0-14-4 4-1 7-4 8-8 1-4 0-7-1-11z" fill={g('stomach')} />
                  <path d="M84 214v-30c0-4 3-7 7-7h18c4 0 7 3 7 7v30" fill="none" stroke={g('colon')} strokeWidth="6" strokeLinecap="round" />
                  <path
                    d="M90 186c4-3 8 3 12 0s8 3 10 0M90 194c4 3 8-3 12 0s8-3 10 0M90 202c4-3 8 3 12 0s8 3 10 0M90 210c4 3 8-3 12 0s8-3 10 0"
                    fill="none"
                    stroke={g('gut')}
                    strokeWidth="4.2"
                    strokeLinecap="round"
                  />
                  <ellipse cx="100" cy="226" rx="6.5" ry="5" fill={g('bladder')} />
                </>,
                [72, 166],
              )}

              {/* Brain */}
              {r(
                'behavioral',
                <>
                  <path d="M80 30c0-12 9-19 20-19s20 7 20 19c0 3-1 5-3 6H83c-2-1-3-3-3-6z" fill={g('brain')} />
                  <path d="M86 20c3 3 6 0 9 3s5 0 8 2 5-1 8 2M84 28c4-2 6 2 10 0s6 2 10 0 6 2 12-1M100 12v23" fill="none" stroke="#a8487a" strokeWidth="0.8" opacity="0.8" />
                </>,
                [124, 18],
              )}

              {/* Eyes (eye & head pressure) */}
              {r(
                'sans',
                <>
                  <ellipse cx="91" cy="41" rx="5" ry="3.2" fill={g('eye')} />
                  <ellipse cx="109" cy="41" rx="5" ry="3.2" fill={g('eye')} />
                  <circle cx="91" cy="41" r="1.9" fill="#0ea5e9" />
                  <circle cx="109" cy="41" r="1.9" fill="#0ea5e9" />
                  <circle cx="91" cy="41" r="0.8" fill="#0b1020" />
                  <circle cx="109" cy="41" r="0.8" fill="#0b1020" />
                </>,
                [122, 44],
              )}

              {/* Heart + main blood vessels: beats at your heart rate */}
              {r(
                'cardio',
                <>
                  <path d="M104 106c0-8 4-12 10-12" fill="none" stroke={g('vessel')} strokeWidth="2.6" strokeLinecap="round" />
                  <path d="M100 150v66M100 216l-10 22M100 216l10 22" fill="none" stroke={g('vessel')} strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
                  <g transform="translate(106 122)">
                    <motion.g animate={reduce ? undefined : { scale: [1, 1.18, 1, 1.07, 1] }} transition={{ duration: beat, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: '0px', originY: '0px' }}>
                      <path d="M0 11C-8 5-14 0-14-7c0-5 4-9 8.5-9 2.7 0 4.4 1.4 5.5 3.4 1.1-2 2.8-3.4 5.5-3.4 4.5 0 8.5 4 8.5 9 0 7-6 12-14 18z" fill={g('heart')} />
                      <path d="M-8-9c-2 2-3 5-2 8" fill="none" stroke="#ffd0d0" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
                    </motion.g>
                  </g>
                </>,
                [122, 112],
              )}
            </g>
          ) : (
            <g filter={`url(#${p}-depth)`}>
              {/* Bones & muscles: skull, spine, shoulder blades, ribs, pelvis, limbs */}
              {r(
                'musculoskeletal',
                <>
                  {Array.from({ length: 16 }, (_, i) => (
                    <rect key={i} x="96.5" y={66 + i * 9.4} width="7" height="7" rx="2.2" {...bone} />
                  ))}
                  <path d="M74 92c6-4 14-4 18 0l-2 26c-6 3-12 2-16-2z" {...bone} />
                  <path d="M126 92c-6-4-14-4-18 0l2 26c6 3 12 2 16-2z" {...bone} />
                  {[104, 114, 124, 134, 144].map((y) => (
                    <path key={y} d={`M96 ${y}c-8 0-16 3-20 9M104 ${y}c8 0 16 3 20 9`} fill="none" stroke={g('bone')} strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
                  ))}
                  {pelvis}
                  {legBones}
                </>,
                [92, 300],
              )}
              {/* Lungs from behind */}
              {r(
                'lungs',
                <>
                  <path d="M94 98c-6-2-14 3-16 12-2 12-2 24 1 32 2 4 7 5 11 3 4-2 5-5 5-10z" fill={g('lung')} opacity="0.9" />
                  <path d="M106 98c6-2 14 3 16 12 2 12 2 24-1 32-2 4-7 5-11 3-4-2-5-5-5-10z" fill={g('lung')} opacity="0.9" />
                </>,
                [72, 104],
              )}
              {/* Kidneys + bladder (stomach & food area) */}
              {r(
                'gi',
                <>
                  <path d="M84 168c-5 0-8 5-7 11 1 6 5 9 9 8 3-1 2-4 1-6-1-2 0-4 1-6 1-4-1-7-4-7z" fill={g('kidney')} />
                  <path d="M116 168c5 0 8 5 7 11-1 6-5 9-9 8-3-1-2-4-1-6 1-2 0-4-1-6-1-4 1-7 4-7z" fill={g('kidney')} />
                  <path d="M87 186l9 34M113 186l-9 34" stroke={g('bladder')} strokeWidth="1.2" />
                  <ellipse cx="100" cy="224" rx="6" ry="4.5" fill={g('bladder')} />
                </>,
                [128, 172],
              )}
              {/* Brain (with cerebellum) */}
              {r(
                'behavioral',
                <>
                  <path d="M79 32c0-14 10-22 21-22s21 8 21 22c0 6-4 10-10 11H89c-6-1-10-5-10-11z" fill={g('brain')} />
                  <path d="M88 44c3 5 7 7 12 7s9-2 12-7c-3 1-7 2-12 2s-9-1-12-2z" fill={g('brain')} />
                  <path d="M100 11v31M86 22c4 2 7-1 10 1M104 23c3-2 6 1 10-1M84 32c5 1 8-2 12 0M104 32c4-2 7 1 12 0" fill="none" stroke="#a8487a" strokeWidth="0.8" opacity="0.8" />
                </>,
                [124, 18],
              )}
              {/* Back of the eyes: optic nerves (eye & head pressure) */}
              {r(
                'sans',
                <path d="M90 40c4 3 7 4 10 4s6-1 10-4" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />,
                [122, 44],
              )}
              {/* Immune: lymph nodes + spleen from behind */}
              {r(
                'immune',
                <>
                  <ellipse cx="73" cy="162" rx="4" ry="7" transform="rotate(20 73 162)" fill={g('spleen')} />
                  {[
                    [71, 100],
                    [129, 100],
                    [90, 70],
                    [110, 70],
                  ].map(([x, y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill={g('lymph')} />
                  ))}
                </>,
                [64, 150],
              )}
              {/* Heart & vessels from behind: main artery down the back */}
              {r(
                'cardio',
                <path d="M103 100v116M103 216l-12 22M103 216l12 22" fill="none" stroke={g('vessel')} strokeWidth="2.2" strokeLinecap="round" />,
                [116, 112],
              )}
            </g>
          )}
        </motion.svg>
      </div>
      <p className="muted mt-1 text-center text-xs">
        {view === 'front' ? 'Front: the heart beats at your latest resting heart rate' : 'Back: brain, spine, lungs and kidneys'} · A glowing outline with “!” needs attention · Tap any organ
      </p>
    </div>
  );
}
