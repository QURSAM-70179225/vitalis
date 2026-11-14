import { useState } from 'react';
import { Starfield } from '@/components/Starfield';
import { motion } from 'framer-motion';
import { ArrowRight, PlayCircle, Radiation, Radio, Rocket, Weight, WifiOff } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { ENVIRONMENT_LIST, commDelaySeconds, formatDelay } from '@/data/environments';
import { HAZARD_LIST } from '@/data/hazards';
import type { EnvironmentId, MissionEnvironment } from '@/types';
import { cn } from '@/utils';
import { ExternalLink, HazardIcon } from '@/components/ui';
import { DISCLAIMER_ENDORSEMENT } from '@/data/resources';
import { Logo } from '@/components/Layout';
import { navigate } from '@/hooks/useRoute';

export function EnvironmentPicker({ value, onChange }: { value: EnvironmentId; onChange: (e: EnvironmentId) => void }) {
  return (
    <div role="radiogroup" aria-label="Mission environment" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ENVIRONMENT_LIST.map((e: MissionEnvironment) => {
        const active = e.id === value;
        return (
          <button
            key={e.id}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(e.id)}
            className={cn(
              'focus-ring panel flex flex-col gap-2 p-4 text-left transition',
              active ? 'border-accent shadow-glow ring-1 ring-accent' : 'hover:border-white/30',
            )}
          >
            <span className="flex items-center justify-between">
              <span className="font-display font-semibold">{e.name}</span>
              {active && <span className="chip border-accent text-accent">Selected</span>}
            </span>
            <span className="muted text-xs">{e.description}</span>
            <span className="mt-1 grid grid-cols-3 gap-2 text-xs">
              <span className="flex items-center gap-1">
                <Weight className="h-3.5 w-3.5 text-accent" aria-hidden /> {e.gravityG} g
              </span>
              <span className="flex items-center gap-1">
                <Radio className="h-3.5 w-3.5 text-accent" aria-hidden /> {formatDelay(commDelaySeconds(e.id, 1))}
              </span>
              <span className="flex items-center gap-1 capitalize">
                <Radiation className="h-3.5 w-3.5 text-pink-400" aria-hidden /> {e.radiationLevel}
              </span>
            </span>
            <span className="text-[11px] text-slate-400">Resupply: {e.resupply}</span>
            <span className="flex gap-1.5" aria-label="Emphasized hazards">
              {e.emphasizedHazards.map((h) => (
                <HazardIcon key={h} id={h} className="h-4 w-4" />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Onboarding() {
  const setupMission = useApp((s) => s.setupMission);
  const loadDemo = useApp((s) => s.loadDemo);
  const [step, setStep] = useState(0);
  const [env, setEnv] = useState<EnvironmentId>('mars-transit');
  const [missionName, setMissionName] = useState('ARES-1');
  const [name, setName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [role, setRole] = useState('Mission Specialist');
  const [busy, setBusy] = useState(false);

  const demo = async () => {
    setBusy(true);
    await loadDemo();
    navigate('dashboard');
    useApp.getState().setTour(true);
  };

  const finish = async () => {
    setBusy(true);
    await setupMission({
      missionName: missionName || 'Mission',
      environmentId: env,
      member: { name: name || 'Astronaut', callsign: (callsign || name.split(' ')[0] || 'CREW').toUpperCase(), role, age: 40, color: '#22d3ee' },
    });
    navigate('checkin');
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Starfield />
      <main id="main" className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <Logo className="mb-10" />
        {step === 0 && (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="eyebrow mb-3 text-accent">NASA Space Apps 2026 · Astronaut Health Monitoring</p>
              <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                Your health, your call,
                <span className="block bg-gradient-to-r from-accent to-accent-teal bg-clip-text text-transparent">even when Earth is 20 minutes away.</span>
              </h1>
              <p className="muted mt-5 max-w-xl text-base leading-relaxed">
                On deep-space missions, communication delay means you can't wait for a flight surgeon. VITALIS turns raw readings into clear{' '}
                <strong className="text-white">status → explanation → action → escalation</strong>, and it all works fully offline.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button className="btn-primary btn-lg" onClick={demo} disabled={busy} data-tour="demo">
                  <PlayCircle className="h-5 w-5" aria-hidden /> Load 90-day Mars demo + tour
                </button>
                <button className="btn-ghost btn-lg" onClick={() => setStep(1)}>
                  <Rocket className="h-5 w-5" aria-hidden /> Set up my mission
                </button>
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                <WifiOff className="h-4 w-4" aria-hidden /> Works with no network. Data stays on this device in IndexedDB.
              </p>
              <p className="mt-6 max-w-xl text-[11px] leading-relaxed text-slate-400">
                {DISCLAIMER_ENDORSEMENT} Sources: <ExternalLink href="https://www.nasa.gov/hrp/hazards/" className="text-[11px]">NASA HRP hazards</ExternalLink>,{' '}
                <ExternalLink href="https://www.nasa.gov/hrp/risks/" className="text-[11px]">HRP risks</ExternalLink>,{' '}
                <ExternalLink href="https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp" className="text-[11px]">CSA radiation monitoring</ExternalLink>.
              </p>
            </div>
            <div className="panel panel-pad">
              <p className="eyebrow mb-3">NASA HRP: five hazards of spaceflight</p>
              <ul className="space-y-3">
                {HAZARD_LIST.map((h) => (
                  <li key={h.id} className="flex gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5">
                      <HazardIcon id={h.id} className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{h.name}</span>
                      <span className="muted block text-xs">{h.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.section>
        )}

        {step === 1 && (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} aria-labelledby="env-h">
            <p className="eyebrow mb-1">Step 1 of 2</p>
            <h1 id="env-h" className="h1 mb-1">Where is your mission?</h1>
            <p className="muted mb-6 text-sm">This sets gravity, communication delay, radiation exposure and which risks VITALIS emphasizes. You can change it later in Settings.</p>
            <EnvironmentPicker value={env} onChange={setEnv} />
            <div className="mt-6 flex justify-between">
              <button className="btn-ghost" onClick={() => setStep(0)}>
                Back
              </button>
              <button className="btn-primary btn-lg" onClick={() => setStep(2)}>
                Next <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </motion.section>
        )}

        {step === 2 && (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl" aria-labelledby="crew-h">
            <p className="eyebrow mb-1">Step 2 of 2</p>
            <h1 id="crew-h" className="h1 mb-6">Crew member profile</h1>
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="mname">Mission name</label>
                <input id="mname" className="field" value={missionName} onChange={(e) => setMissionName(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="cname">Your name</label>
                <input id="cname" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam Rivera" autoComplete="name" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ccs">Callsign</label>
                  <input id="ccs" className="field uppercase" value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="e.g. FALCON" />
                </div>
                <div>
                  <label className="label" htmlFor="crole">Role</label>
                  <select id="crole" className="field" value={role} onChange={(e) => setRole(e.target.value)}>
                    {['Commander', 'Pilot', 'Mission Specialist', 'Flight Engineer', 'Crew Medical Officer'].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-8 flex justify-between">
              <button className="btn-ghost" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn-primary btn-lg" onClick={finish} disabled={busy}>
                Start first check-in <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </motion.section>
        )}
      </main>
    </div>
  );
}
