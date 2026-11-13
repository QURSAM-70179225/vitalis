import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Clock, Search } from 'lucide-react';
import { GUIDANCE, GUIDANCE_CATEGORIES, GUIDANCE_LIST, type GuidanceCard } from '@/data/guidance';
import { SYSTEMS } from '@/data/systems';
import { useTriage } from '@/hooks/useMission';
import { LEVEL_META, maxLevel } from '@/engine/status';
import type { StatusLevel } from '@/types';
import { cn } from '@/utils';
import { ExternalLink, HazardBadges, PageHeader, Panel, StatusBadge } from '@/components/ui';
import { resourceById } from '@/data/resources';
import { Breathing } from './Cognitive';

function CardDetail({ card, level }: { card: GuidanceCard; level: StatusLevel }) {
  const triage = useTriage();
  const related = triage?.alerts.filter((a) => a.guidanceIds.includes(card.id)) ?? [];
  return (
    <>
      <a href="#/guidance" className="mb-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Guidance library
      </a>
      <PageHeader eyebrow={card.category} title={card.title} subtitle={card.summary} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <HazardBadges ids={card.hazards} />
            {card.minutes && (
              <span className="chip">
                <Clock className="h-3.5 w-3.5" aria-hidden /> {card.minutes} min
              </span>
            )}
          </div>
          <h2 className="eyebrow mb-2">Protocol</h2>
          <ol className="space-y-3">
            {card.steps.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="numeral grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-sm text-accent">{i + 1}</span>
                <span className="pt-1 text-[15px] leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
          {card.tips && (
            <>
              <h2 className="eyebrow mb-2 mt-6">Tips</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {card.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {card.escalate && (
            <p className="mt-6 flex gap-2 rounded-xl border border-critical/40 bg-critical/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
              <span>
                <span className="font-semibold">Escalate: </span>
                {card.escalate}
              </span>
            </p>
          )}
          <p className="muted mt-6 text-xs">Source: {card.source}</p>
          {card.links && card.links.length > 0 && (
            <div className="mt-4 rounded-xl bg-white/5 p-3">
              <h2 className="eyebrow mb-2">Further reading: Space Apps resources</h2>
              <ul className="space-y-1 text-sm">
                {card.links.map((id) => {
                  const r = resourceById(id);
                  return (
                    <li key={id}>
                      <span className="muted mr-1 text-xs font-semibold">{r.org}</span>
                      <ExternalLink href={r.url}>{r.title}</ExternalLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Panel>
        <div className="flex flex-col gap-5">
          {related.length > 0 && (
            <Panel className={LEVEL_META[level].border}>
              <h2 className="h2 mb-2">Why this is recommended for you</h2>
              <ul className="space-y-2 text-sm">
                {related.map((a) => (
                  <li key={a.id}>
                    <StatusBadge level={a.level} size="sm" /> <span className="font-semibold">{a.title}</span>
                    <span className="muted block">{a.why[0]}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {card.id === 'breathing' && <Breathing />}
          <Panel>
            <h2 className="eyebrow mb-2">Body systems</h2>
            <div className="flex flex-wrap gap-2">
              {card.systems.map((s) => (
                <a key={s} href={`#/system/${s}`} className="chip hover:border-accent">
                  {SYSTEMS[s].name}
                </a>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

export default function Guidance({ id }: { id?: string }) {
  const triage = useTriage();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');

  const recommended = useMemo(() => {
    const m = new Map<string, StatusLevel>();
    for (const a of triage?.alerts ?? []) for (const g of a.guidanceIds) m.set(g, maxLevel(m.get(g) ?? 'nominal', a.level));
    return m;
  }, [triage]);

  if (id && GUIDANCE[id]) return <CardDetail card={GUIDANCE[id]} level={recommended.get(id) ?? 'nominal'} />;

  const list = GUIDANCE_LIST.filter(
    (c) => (cat === 'all' || c.category === cat) && (!q || `${c.title} ${c.summary} ${c.category}`.toLowerCase().includes(q.toLowerCase())),
  ).sort((a, b) => (recommended.has(b.id) ? 1 : 0) - (recommended.has(a.id) ? 1 : 0));

  return (
    <>
      <PageHeader eyebrow="Countermeasures" title="Guidance library" subtitle="Clear, step-by-step protocols. Every flagged indicator links straight to the card that helps. Cards recommended for you are shown first." />
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="gq" className="sr-only">
            Search guidance
          </label>
          <input id="gq" className="field pl-10" placeholder="Search: sleep, radiation, bone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
          {['all', ...GUIDANCE_CATEGORIES].map((c) => (
            <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)} className={cn('chip focus-ring min-h-[40px]', cat === c && 'border-accent text-accent')}>
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => {
          const lvl = recommended.get(c.id);
          return (
            <a key={c.id} href={`#/guidance/${c.id}`} className={cn('panel focus-ring flex flex-col gap-2 p-4 transition hover:border-white/30', lvl && LEVEL_META[lvl].border)}>
              <div className="flex items-start justify-between gap-2">
                <span className="eyebrow">{c.category}</span>
                {lvl && lvl !== 'nominal' && <span className={cn('chip', LEVEL_META[lvl].text, LEVEL_META[lvl].border)}>Recommended for you</span>}
              </div>
              <h2 className="font-display text-lg font-semibold">{c.title}</h2>
              <p className="muted flex-1 text-sm">{c.summary}</p>
              <div className="flex items-center justify-between">
                <HazardBadges ids={c.hazards} compact />
                {c.minutes && <span className="muted text-xs">{c.minutes} min</span>}
              </div>
            </a>
          );
        })}
      </div>
    </>
  );
}
