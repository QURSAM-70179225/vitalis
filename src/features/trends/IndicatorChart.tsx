import { useId, useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { IndicatorId, MissionEventType, StatusLevel } from '@/types';
import { useApp } from '@/store/useApp';
import { useCrewData, useMissionContext, useThresholds } from '@/hooks/useMission';
import { INDICATORS } from '@/data/indicators';
import { buildSeries } from '@/engine/series';
import { rollingBand } from '@/engine/baseline';
import { levelFromBands, startMean } from '@/engine/triage';
import { LEVEL_META, maxLevel } from '@/engine/status';
import { displayDigits, toDisplay, unitLabel } from '@/utils/units';

export const EVENT_STYLE: Record<MissionEventType, { color: string; label: string }> = {
  eva: { color: '#60a5fa', label: 'EVA' },
  spe: { color: '#f472b6', label: 'Solar event' },
  illness: { color: '#fb923c', label: 'Illness' },
  intervention: { color: '#34d399', label: 'Intervention' },
  other: { color: '#94a3b8', label: 'Event' },
};

interface Row {
  day: number;
  value: number | null;
  band: [number, number] | null;
  baseMean: number | null;
  level: StatusLevel;
}

export function IndicatorChart({
  indicator,
  range,
  height = 240,
  crewId,
  showLegend = true,
}: {
  indicator: IndicatorId;
  range: number;
  height?: number;
  crewId?: string;
  showLegend?: boolean;
}) {
  const { env, day } = useMissionContext();
  const units = useApp((s) => s.settings.units);
  const events = useApp((s) => s.events);
  const thresholds = useThresholds();
  const { checkIns, cognitive } = useCrewData(crewId);
  const meta = INDICATORS[indicator];
  const cfg = thresholds[indicator];
  const gid = useId().replace(/:/g, '');

  const { rows, normal, member } = useMemo(() => {
    const s = buildSeries(checkIns, cognitive)[indicator] ?? [];
    const band = rollingBand(
      s.map((p) => p.value),
      14,
      cfg.minSd,
    );
    const start = startMean(s);
    const toBand = (v: number) => (cfg.mode === 'envScaled' ? v / env.baselineDoseMsvPerDay : cfg.mode === 'relativeToStart' ? ((v - start) / start) * 100 : v);
    const fromBand = (b: number) => (cfg.mode === 'envScaled' ? b * env.baselineDoseMsvPerDay : cfg.mode === 'relativeToStart' ? start * (1 + b / 100) : b);
    const d = (v: number) => Number(toDisplay(indicator, v, units).toFixed(displayDigits(indicator, units) + 1));
    const all: Row[] = s.map((p, i) => {
      const b = band[i];
      let lvl = levelFromBands(toBand(p.value), cfg.bands).level;
      if (cfg.baseline && b) {
        const sd = (b.hi - b.lo) / 2;
        const z = sd ? (p.value - b.mean) / sd : 0;
        const worse = cfg.worse === 'both' || (cfg.worse === 'high' ? z > 0 : z < 0);
        if (worse && Math.abs(z) >= 2) lvl = maxLevel(lvl, 'monitor');
      }
      return { day: p.day, value: d(p.value), band: cfg.baseline && b ? [d(b.lo), d(b.hi)] : null, baseMean: cfg.baseline && b ? d(b.mean) : null, level: lvl };
    });
    const lo = cfg.bands.monLow !== undefined ? d(fromBand(cfg.bands.monLow)) : null;
    const hi = cfg.bands.monHigh !== undefined ? d(fromBand(cfg.bands.monHigh)) : null;
    return { rows: all.filter((r) => r.day > day - range), normal: { lo, hi }, member: s.length };
  }, [checkIns, cognitive, indicator, cfg, env, units, day, range]);

  const evs = events.filter((e) => e.day > day - range && (e.crewIds.length === 0 || e.crewIds.includes(crewId ?? checkIns[0]?.crewId ?? '')));
  const values = rows.map((r) => r.value).filter((v): v is number => v !== null);
  const bandVals = rows.flatMap((r) => r.band ?? []);
  const yVals = [...values, ...bandVals, ...(normal.lo !== null ? [normal.lo] : []), ...(normal.hi !== null ? [normal.hi] : [])];
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);
  const pad = (yMax - yMin) * 0.12 || 1;
  const fine = yMax - yMin < 6;
  const r = (v: number, f: (x: number) => number) => (fine ? f(v * 10) / 10 : f(v));
  const floor = meta.min >= 0 ? 0 : -Infinity;
  const domain: [number, number] = [Math.max(floor, r(yMin - pad, Math.floor)), r(yMax + pad, Math.ceil)];
  const unit = unitLabel(indicator, units);

  if (!member || !rows.length)
    return (
      <div>
        <p className="font-semibold">{meta.label}</p>
        <p className="muted py-8 text-center text-sm">No readings in this period yet.</p>
      </div>
    );

  const latest = rows[rows.length - 1];
  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display font-semibold">{meta.label}</span>
        <span className="text-sm">
          <span className="numeral text-xl" style={{ color: LEVEL_META[latest.level].color }}>
            {latest.value}
          </span>{' '}
          <span className="muted">{unit}</span>
        </span>
      </figcaption>
      <div style={{ height }} role="img" aria-label={`${meta.label} over the last ${range} days. Latest ${latest.value} ${unit}, status ${LEVEL_META[latest.level].label}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id={`line-${gid}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#22d3ee" stopOpacity={0.35} />
                <stop offset="1" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
            <XAxis dataKey="day" type="number" domain={['dataMin', 'dataMax']} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(d: number) => `D${d}`} stroke="rgba(148,163,184,.2)" />
            <YAxis domain={domain} tickCount={5} tickFormatter={(v: number) => (fine ? String(Number(v.toFixed(1))) : String(Math.round(v)))} tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="rgba(148,163,184,.2)" width={48} allowDecimals />
            {/* Absolute normal band */}
            {normal.lo !== null || normal.hi !== null ? (
              <Area
                dataKey={() => [normal.lo ?? domain[0], normal.hi ?? domain[1]]}
                isAnimationActive={false}
                stroke="none"
                fill="#34d399"
                fillOpacity={0.07}
                name="Normal range"
                legendType="none"
                activeDot={false}
              />
            ) : null}
            {/* Personal baseline band (14-day mean ± 1 SD) */}
            <Area dataKey="band" stroke="#a78bfa" strokeOpacity={0.35} strokeDasharray="3 3" fill="#a78bfa" fillOpacity={0.14} isAnimationActive={false} name="Your baseline ±1 SD" connectNulls activeDot={false} />
            {evs.map((e) => (
              <ReferenceLine key={e.id} x={e.day} stroke={EVENT_STYLE[e.type].color} strokeDasharray="4 3" label={{ value: EVENT_STYLE[e.type].label, position: 'insideTopLeft', fill: EVENT_STYLE[e.type].color, fontSize: 10 }} />
            ))}
            <Area type="monotone" dataKey="value" stroke="none" fill={`url(#line-${gid})`} isAnimationActive={false} activeDot={false} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#22d3ee"
              strokeWidth={2}
              name={meta.label}
              dot={(p: { cx?: number; cy?: number; payload?: Row; index?: number }) => {
                const lvl = p.payload?.level ?? 'nominal';
                const big = lvl !== 'nominal';
                return <circle key={`d${p.index}`} cx={p.cx} cy={p.cy} r={big ? 4 : 2} fill={LEVEL_META[lvl].color} stroke={big ? '#03060f' : 'none'} strokeWidth={1} />;
              }}
              activeDot={{ r: 6 }}
              animationDuration={600}
            />
            <Tooltip
              contentStyle={{ background: '#0a1124', border: '1px solid rgba(103,232,249,.25)', borderRadius: 12, fontSize: 12 }}
              labelFormatter={(d) => `Mission day ${d}`}
              formatter={(v: unknown, name: string) => {
                if (Array.isArray(v)) return [`${v[0]} – ${v[1]} ${unit}`, name];
                return [`${v} ${unit}`, name];
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {showLegend && (
        <div className="muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-nominal/30" aria-hidden /> Normal range
          </span>
          {cfg.baseline && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm border border-dashed border-violet-400 bg-violet-400/20" aria-hidden /> Your baseline (14-day ±1 SD)
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-monitor" aria-hidden /> Flagged reading
          </span>
        </div>
      )}
    </figure>
  );
}
