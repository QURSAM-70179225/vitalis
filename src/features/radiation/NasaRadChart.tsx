import { useState } from 'react';
import { Database } from 'lucide-react';
import { MSL_RAD_CRUISE, MSL_RAD_SOURCE } from '@/data/nasa/mslRadCruise';
import { DEMO_RAD_START, realRadiationForDay } from '@/data/nasa/radiationTimeline';
import { ExternalLink, Panel } from '@/components/ui';

const W = 720;
const H = 200;
const PAD = { l: 40, r: 10, t: 12, b: 26 };

/**
 * Real NASA data: every day of Curiosity's RAD measurements on the way to Mars, drawn as a
 * hand-made SVG bar chart (no chart library). Solar storms are highlighted; the 90 days used
 * by the demo mission are shaded.
 */
export function NasaRadChart() {
  const [hover, setHover] = useState<number | null>(null);
  const data = MSL_RAD_CRUISE;
  const max = Math.max(...data.map((r) => r.q));
  const t0 = Date.parse(`${data[0].d}T00:00:00Z`);
  const span = (Date.parse(`${data[data.length - 1].d}T00:00:00Z`) - t0) / 86_400_000 + 1;
  const x = (d: string) => PAD.l + ((Date.parse(`${d}T00:00:00Z`) - t0) / 86_400_000 / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const bw = Math.max(1.5, (W - PAD.l - PAD.r) / span - 0.6);
  const demoFrom = x(DEMO_RAD_START);
  const demoTo = x(realRadiationForDay(90)!.date) + bw;
  const sel = hover !== null ? data[hover] : data.reduce((m, r) => (r.q > m.q ? r : m));
  const storms = data.filter((r) => r.s).length;
  const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  return (
    <Panel aria-labelledby="nasa-rad-h">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="nasa-rad-h" className="flex items-center gap-2 font-display text-lg font-semibold">
          <Database className="h-5 w-5 text-pink-400" aria-hidden /> Real NASA data: radiation on the way to Mars
        </h3>
        <ExternalLink href={MSL_RAD_SOURCE.url} className="text-xs">
          NASA Planetary Data System
        </ExternalLink>
      </div>
      <p className="muted mb-3 text-sm">
        Measured every few minutes by the Radiation Assessment Detector on NASA&apos;s Curiosity rover during its {MSL_RAD_SOURCE.days}-day cruise ({fmtDate(MSL_RAD_SOURCE.from)} to {fmtDate(MSL_RAD_SOURCE.to)}):{' '}
        {MSL_RAD_SOURCE.observations.toLocaleString()} readings, {storms} solar-storm days. The demo mission&apos;s radiation uses the shaded 90 days.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Daily radiation dose from ${fmtDate(MSL_RAD_SOURCE.from)} to ${fmtDate(MSL_RAD_SOURCE.to)}. Highest on 8 March 2012 during a solar storm.`} onMouseLeave={() => setHover(null)}>
        <rect x={demoFrom} y={PAD.t} width={demoTo - demoFrom} height={H - PAD.t - PAD.b} fill="rgba(34,211,238,0.08)" />
        <text x={demoFrom + 4} y={PAD.t + 12} fontSize="10" fill="rgba(34,211,238,0.9)">
          demo mission days 1–90
        </text>
        {[0, Math.round(max / 2), Math.floor(max)].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.08)" />
            <text x={PAD.l - 6} y={y(v) + 3} fontSize="10" textAnchor="end" fill="rgba(148,163,184,1)">
              {v}
            </text>
          </g>
        ))}
        <text x={4} y={PAD.t + 4} fontSize="10" fill="rgba(148,163,184,1)">
          mSv
        </text>
        {data.map((r, i) => (
          <rect
            key={r.d}
            x={x(r.d)}
            y={y(r.q)}
            width={bw}
            height={H - PAD.b - y(r.q)}
            fill={r.s ? '#f472b6' : i === hover ? '#e2e8f0' : '#64748b'}
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {['2012-01-01', '2012-03-01', '2012-05-01', '2012-07-01'].map((d) => (
          <text key={d} x={x(d)} y={H - 8} fontSize="10" fill="rgba(148,163,184,1)">
            {new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })}
          </text>
        ))}
      </svg>
      <p className="mt-2 text-sm" aria-live="polite">
        <span className="font-semibold">{fmtDate(sel.d)}:</span> {sel.q.toFixed(2)} mSv (absorbed {sel.a.toFixed(2)} mGy, {sel.n} readings)
        {sel.s ? ' · solar storm' : ''}
      </p>
      <p className="muted mt-2 text-xs">
        <span className="inline-block h-2 w-2 rounded-sm bg-pink-400" aria-hidden /> Solar storm days. Absorbed dose is measured; the mSv value is an estimate of the dose to a crew member (method in
        data/nasa/README.md). Data set {MSL_RAD_SOURCE.dataset}, {MSL_RAD_SOURCE.archive}. Hassler et al. / Zeitlin et al., Science 2013.
      </p>
    </Panel>
  );
}
