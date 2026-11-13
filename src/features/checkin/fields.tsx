import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, Minus, Plus } from 'lucide-react';
import type { IndicatorId, MissionEnvironment, StatusLevel, SymptomId, UnitPrefs } from '@/types';
import { INDICATORS, MOOD_EMOJI, MOOD_LABELS, SYMPTOMS, SYMPTOM_IDS } from '@/data/indicators';
import { levelFromBands } from '@/engine/triage';
import type { ThresholdConfig } from '@/engine/thresholds';
import { displayRange, fromDisplay, toDisplay, unitLabel } from '@/utils/units';
import { cn } from '@/utils';
import { HazardBadges, StatusBadge } from '@/components/ui';

/** "ⓘ How to measure in space" panel. */
export function HowToMeasure({ id }: { id: IndicatorId }) {
  const [open, setOpen] = useState(false);
  const meta = INDICATORS[id];
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        className="focus-ring inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-accent hover:bg-accent/10"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <Info className="h-4 w-4" aria-hidden /> How to measure in space
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={panelId} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm">
              <ol className="list-decimal space-y-1 pl-5">
                {meta.howTo.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <p>
                <span className="font-semibold text-accent">Why it matters in space: </span>
                {meta.howTo.why}
              </p>
              <p>
                <span className="font-semibold text-nominal">Normal range: </span>
                {meta.howTo.normal}
              </p>
              <HazardBadges ids={meta.hazards} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Live status of a canonical value, honouring threshold modes. */
export function liveLevel(_id: IndicatorId, v: number, cfg: ThresholdConfig, env: MissionEnvironment, startMass?: number): StatusLevel {
  let bv = v;
  if (cfg.mode === 'envScaled') bv = v / env.baselineDoseMsvPerDay;
  if (cfg.mode === 'relativeToStart') {
    if (!startMass) return 'nominal';
    bv = ((v - startMass) / startMass) * 100;
  }
  return levelFromBands(bv, cfg.bands).level;
}

export function NumberField({
  id,
  value,
  onChange,
  units,
  level,
  skipped,
  onSkip,
  optionalLabel,
}: {
  id: IndicatorId;
  value: number;
  onChange: (canonical: number) => void;
  units: UnitPrefs;
  level: StatusLevel;
  skipped?: boolean;
  onSkip?: (skip: boolean) => void;
  optionalLabel?: string;
}) {
  const meta = INDICATORS[id];
  const { min, max, step } = displayRange(id, units);
  const disp = toDisplay(id, value, units);
  const digits = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
  const shown = Number(disp.toFixed(digits));
  const inputId = useId();
  const set = (d: number) => onChange(fromDisplay(id, Math.min(max, Math.max(min, Number(d.toFixed(digits)))), units));
  const bigStep = id === 'hydration' ? 250 : id === 'exerciseAerobic' || id === 'exerciseResistive' ? 5 : step;

  return (
    <div className={cn('panel p-4 sm:p-5', skipped && 'opacity-60')}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <label htmlFor={inputId} className="font-display text-base font-semibold">
          {meta.label}
          {optionalLabel && <span className="muted ml-2 text-xs font-normal">{optionalLabel}</span>}
        </label>
        {!skipped && <StatusBadge level={level} size="sm" />}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="btn-ghost btn-icon h-14 w-14 shrink-0 rounded-2xl" aria-label={`Decrease ${meta.label}`} onClick={() => set(shown - bigStep)} disabled={skipped}>
          <Minus className="h-6 w-6" />
        </button>
        <div className="flex flex-1 items-baseline justify-center gap-2">
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            className="numeral w-full min-w-0 bg-transparent text-center text-5xl outline-none focus:ring-0 sm:text-6xl"
            value={Number.isFinite(shown) ? shown : ''}
            min={min}
            max={max}
            step={step}
            disabled={skipped}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n)) onChange(fromDisplay(id, n, units));
            }}
            aria-describedby={`${inputId}-unit`}
          />
          <span id={`${inputId}-unit`} className="muted shrink-0 text-lg">
            {unitLabel(id, units)}
          </span>
        </div>
        <button type="button" className="btn-ghost btn-icon h-14 w-14 shrink-0 rounded-2xl" aria-label={`Increase ${meta.label}`} onClick={() => set(shown + bigStep)} disabled={skipped}>
          <Plus className="h-6 w-6" />
        </button>
      </div>
      <input
        type="range"
        className="mt-4"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={skipped}
        onChange={(e) => set(parseFloat(e.target.value))}
        aria-label={`${meta.label} slider`}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <HowToMeasure id={id} />
        {onSkip && (
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 px-1 text-xs text-slate-300">
            <input type="checkbox" className="h-6 w-6 accent-cyan-400" checked={!!skipped} onChange={(e) => onSkip(e.target.checked)} />
            Not measured today
          </label>
        )}
      </div>
    </div>
  );
}

export function ScaleField({ id, value, onChange, level }: { id: IndicatorId; value: number; onChange: (v: number) => void; level: StatusLevel }) {
  const meta = INDICATORS[id];
  const isMood = meta.input === 'emoji';
  const gid = useId();
  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p id={gid} className="font-display text-base font-semibold">
          {meta.label}
        </p>
        <StatusBadge level={level} size="sm" />
      </div>
      <div role="radiogroup" aria-labelledby={gid} className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={isMood ? `${n} – ${MOOD_LABELS[n - 1]}` : `${n} of 5`}
              onClick={() => onChange(n)}
              className={cn(
                'focus-ring flex min-h-[64px] flex-col items-center justify-center rounded-2xl border text-center transition',
                active ? 'border-accent bg-accent/20 shadow-glow' : 'border-white/10 bg-white/5 hover:bg-white/10',
              )}
            >
              <span className={cn(isMood ? 'text-3xl' : 'numeral text-2xl')}>{isMood ? MOOD_EMOJI[n - 1] : n}</span>
              {isMood && <span className="mt-0.5 text-[10px] text-slate-300">{MOOD_LABELS[n - 1]}</span>}
            </button>
          );
        })}
      </div>
      {meta.scaleLabels && (
        <div className="muted mt-1.5 flex justify-between text-xs">
          <span>{meta.scaleLabels[0]}</span>
          <span>{meta.scaleLabels[1]}</span>
        </div>
      )}
      <div className="mt-2">
        <HowToMeasure id={id} />
      </div>
    </div>
  );
}

export function SymptomGrid({ value, onChange }: { value: SymptomId[]; onChange: (v: SymptomId[]) => void }) {
  return (
    <fieldset className="panel p-4 sm:p-5">
      <legend className="sr-only">Symptoms</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SYMPTOM_IDS.map((s) => {
          const m = SYMPTOMS[s];
          const on = value.includes(s);
          const urgent = s === 'chestPain' || s === 'shortnessOfBreath';
          return (
            <label
              key={s}
              className={cn(
                'focus-within:ring-2 focus-within:ring-accent flex min-h-[64px] cursor-pointer items-start gap-3 rounded-xl border p-3 transition',
                on ? (urgent ? 'border-critical bg-critical/15' : 'border-accent bg-accent/15') : 'border-white/10 bg-white/5 hover:bg-white/10',
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-6 w-6 shrink-0 accent-cyan-400"
                checked={on}
                onChange={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])}
              />
              <span>
                <span className="block text-sm font-semibold">{m.label}</span>
                <span className="muted block text-xs">{m.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
