import { ArrowRight, Earth, Info, Library } from 'lucide-react';
import { DISCLAIMER_ENDORSEMENT, EARTH_BENEFITS, RESOURCES } from '@/data/resources';
import { HAZARD_LIST } from '@/data/hazards';
import { DISCLAIMER } from '@/engine/thresholds';
import { ExternalLink, HazardIcon, PageHeader, Panel } from '@/components/ui';
import { GlossaryPanel } from '@/features/glossary/GlossaryPanel';
import { NasaRadChart } from '@/features/radiation/NasaRadChart';

export default function About() {
  return (
    <>
      <PageHeader
        eyebrow="NASA Space Apps Challenge 2026"
        title="About & sources"
        subtitle="VITALIS helps astronauts check their own health, spot risky trends early and know what to do, even when Earth is 20 minutes away. These are the official challenge resources it is built on."
      />

      <section aria-labelledby="res-h" className="mb-8">
        <h2 id="res-h" className="h2 mb-3 flex items-center gap-2">
          <Library className="h-5 w-5 text-accent" aria-hidden /> Space Apps resources used
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {RESOURCES.map((r) => (
            <Panel key={r.id} as="article" aria-labelledby={`r-${r.id}`}>
              <p className="eyebrow mb-1">{r.org === 'NASA' ? 'NASA Human Research Program' : 'Canadian Space Agency (CSA)'}</p>
              <h3 id={`r-${r.id}`} className="font-display text-lg font-semibold">
                <ExternalLink href={r.url}>{r.title}</ExternalLink>
              </h3>
              <p className="muted mb-3 mt-1 text-sm">{r.summary}</p>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-300">How VITALIS uses it</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {r.usedFor.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
              {r.route && (
                <a href={`#/${r.route}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                  See it in the app <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              )}
            </Panel>
          ))}
        </div>
      </section>

      <section aria-labelledby="data-h" className="mb-8">
        <h2 id="data-h" className="h2 mb-1">Real NASA data in VITALIS</h2>
        <p className="muted mb-3 max-w-3xl text-sm">
          The demo crew&apos;s health readings are made up (real astronaut medical records are private), but their <b>radiation is real</b>: every day comes from NASA&apos;s Curiosity rover, which measured
          space radiation on its way to Mars. The full list of what VITALIS uses, where it comes from and its license is in DATA_SOURCES.md in the project.
        </p>
        <NasaRadChart />
      </section>

      <section aria-labelledby="hz-h" className="mb-8">
        <h2 id="hz-h" className="h2 mb-3">The five hazards, in the app</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {HAZARD_LIST.map((h) => (
            <li key={h.id} className="panel p-4">
              <HazardIcon id={h.id} className="mb-2 h-6 w-6" />
              <p className="font-semibold">{h.name}</p>
              <p className="muted text-xs">{h.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="earth-h" className="mb-8">
        <h2 id="earth-h" className="h2 mb-1 flex items-center gap-2">
          <Earth className="h-5 w-5 text-nominal" aria-hidden /> Benefits on Earth
        </h2>
        <p className="muted mb-3 max-w-3xl text-sm">
          As the CSA puts it,{' '}
          <ExternalLink href={RESOURCES.find((r) => r.id === 'csa-science')!.url}>research done for space also improves life on Earth</ExternalLink>. The problem VITALIS solves (no doctor nearby, slow or no
          connection, a person who needs to know what to do now) exists on Earth too:
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {EARTH_BENEFITS.map((b) => (
            <div key={b.title} className="panel p-4">
              <p className="font-semibold">{b.title}</p>
              <p className="muted mt-1 text-xs">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mb-8">
        <GlossaryPanel />
      </div>

      <Panel className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
        <div className="space-y-2 text-sm">
          <p>{DISCLAIMER_ENDORSEMENT}</p>
          <p className="muted">{DISCLAIMER}</p>
          <p className="muted text-xs">Links to NASA and CSA websites open in a new tab and need a connection. Each site has its own terms of use.</p>
        </div>
      </Panel>
    </>
  );
}
