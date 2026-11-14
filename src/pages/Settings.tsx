import { useRef, useState } from 'react';
import { Accessibility, BellRing, Cpu, Database, Download, Lock, PlayCircle, RotateCcw, Rocket, Ruler, ScrollText, SlidersHorizontal, Trash2, Upload, UserPlus } from 'lucide-react';
import type { IndicatorId, ThresholdBands } from '@/types';
import { useApp } from '@/store/useApp';
import { isExportBundle } from '@/store/db';
import { useMissionContext } from '@/hooks/useMission';
import { navigate } from '@/hooks/useRoute';
import { INDICATORS, INDICATOR_IDS } from '@/data/indicators';
import { THRESHOLDS, DISCLAIMER } from '@/engine/thresholds';
import { RULESET } from '@/engine/triage';
import { downloadBlob, hashPasscode } from '@/utils';
import { EnvironmentPicker } from './Onboarding';
import { AccountPanel } from '@/features/account/AccountPanel';
import { PageHeader, Panel } from '@/components/ui';
import { stopAlertSound } from '@/utils/sound';

const BAND_KEYS: (keyof ThresholdBands)[] = ['critLow', 'actLow', 'monLow', 'monHigh', 'actHigh', 'critHigh'];
const BAND_LABEL: Record<keyof ThresholdBands, string> = { critLow: '🔴 ≤', actLow: '🟠 ≤', monLow: '🟡 ≤', monHigh: '🟡 ≥', actHigh: '🟠 ≥', critHigh: '🔴 ≥' };

function Section({ icon: Icon, title, children, id }: { icon: typeof Ruler; title: string; children: React.ReactNode; id?: string }) {
  return (
    <Panel aria-labelledby={`${id ?? title}-h`}>
      <h2 id={`${id ?? title}-h`} className="h2 mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-accent" aria-hidden /> {title}
      </h2>
      {children}
    </Panel>
  );
}

function Toggle({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <label className="flex min-h-[48px] cursor-pointer items-start justify-between gap-4 py-1">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="muted block text-xs">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="mt-1 h-6 w-6 shrink-0 accent-cyan-400" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function Settings() {
  const s = useApp((x) => x.settings);
  const mission = useApp((x) => x.mission)!;
  const update = useApp((x) => x.updateSettings);
  const updateMission = useApp((x) => x.updateMission);
  const addCrew = useApp((x) => x.addCrew);
  const exportData = useApp((x) => x.exportData);
  const importData = useApp((x) => x.importData);
  const wipe = useApp((x) => x.wipe);
  const loadDemo = useApp((x) => x.loadDemo);
  const setTour = useApp((x) => x.setTour);
  const toast = useApp((x) => x.toast);
  const { env } = useMissionContext();
  const signedIn = useApp((x) => !!x.cloud.userId && !x.mission?.demo);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pass, setPass] = useState('');
  const [newCrew, setNewCrew] = useState({ name: '', callsign: '' });
  const [thInd, setThInd] = useState<IndicatorId>('systolic');
  const hasKey = !!import.meta.env.VITE_GROQ_API_KEY;

  const bands = { ...THRESHOLDS[thInd].bands, ...s.thresholdOverrides[thInd] };
  const setBand = (k: keyof ThresholdBands, v: string) => {
    const n = v === '' ? undefined : Number(v);
    const cur = { ...s.thresholdOverrides[thInd], [k]: n };
    void update({ thresholdOverrides: { ...s.thresholdOverrides, [thInd]: cur } });
  };

  return (
    <>
      <PageHeader eyebrow="Configuration" title="Settings" subtitle={
          signedIn
            ? 'Everything is saved on this device first (it works offline), then synced to your mission when a connection is available. Your journal is visible only to you.'
            : 'All data stays on this device in IndexedDB. Nothing leaves unless you tap Send to Ground, send a hand-off file, or turn on the optional AI layer.'
        } />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <AccountPanel />
        </div>
        <div className="lg:col-span-2">
          <Section icon={Rocket} title="Mission">
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="mn" className="label">
                  Mission name
                </label>
                <input id="mn" className="field" value={mission.name} readOnly={signedIn} onChange={(e) => updateMission({ name: e.target.value })} />
              </div>
              <div className="flex items-end gap-2">
                <button className="btn-ghost" onClick={() => setTour(true)}>
                  <PlayCircle className="h-4 w-4" aria-hidden /> Replay guided tour
                </button>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    if (confirm('Replace all local data with the 90-day Mars demo?')) {
                      await loadDemo();
                      navigate('dashboard');
                    }
                  }}
                >
                  <Database className="h-4 w-4" aria-hidden /> Load demo
                </button>
              </div>
            </div>
            <p className="label">Environment: {env.name}</p>
            {signedIn ? (
              <p className="muted text-sm">Mission name and environment are set when the mission is created and shared by the whole crew.</p>
            ) : (
              <EnvironmentPicker value={mission.environmentId} onChange={(id) => updateMission({ environmentId: id })} />
            )}
          </Section>
        </div>

        <Section icon={Ruler} title="Units">
          {(
            [
              ['temperature', 'Temperature', ['C', 'F']],
              ['mass', 'Body mass', ['kg', 'lb']],
              ['glucose', 'Glucose', ['mg/dL', 'mmol/L']],
            ] as const
          ).map(([k, label, opts]) => (
            <div key={k} className="flex items-center justify-between py-2">
              <span className="text-sm">{label}</span>
              <div role="radiogroup" aria-label={label} className="flex rounded-xl border border-white/10 p-0.5">
                {opts.map((o) => (
                  <button key={o} role="radio" aria-checked={s.units[k] === o} onClick={() => update({ units: { ...s.units, [k]: o } })} className={`focus-ring h-10 rounded-lg px-4 text-sm ${s.units[k] === o ? 'bg-accent text-space-950' : ''}`}>
                    {k === 'temperature' ? `°${o}` : o}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section icon={Accessibility} title="Accessibility & prompts">
          <Toggle label="High-contrast mode" hint="Solid black and white with stronger borders" checked={s.highContrast} onChange={(v) => update({ highContrast: v })} />
          <Toggle label="Reduce motion" hint="Turns off animations (also follows your OS setting)" checked={s.reducedMotion} onChange={(v) => update({ reducedMotion: v })} />
          <div data-silence-alerts>
            <Toggle
              label="Alert sounds & vibration"
              hint="Beep for urgent alerts, a soft chime when all is good"
              checked={s.alertSound}
              onChange={(v) => {
                if (!v) stopAlertSound();
                update({ alertSound: v });
              }}
            />
          </div>
          <Toggle label="Smart prompts" hint="On-screen reminders at scheduled times" checked={s.notifications} onChange={(v) => update({ notifications: v })} />
          {'Notification' in window && Notification.permission !== 'granted' && (
            <button className="btn-ghost mt-2" onClick={() => Notification.requestPermission()}>
              <BellRing className="h-4 w-4" aria-hidden /> Allow system notifications
            </button>
          )}
          <div className="mt-3">
            <label htmlFor="warp" className="label">
              Ground-link demo time-warp: ×{s.timeWarp}
            </label>
            <input id="warp" type="range" min={1} max={120} value={s.timeWarp} onChange={(e) => update({ timeWarp: Number(e.target.value) })} />
            <p className="muted text-xs">×1 = real light-time. Higher values speed up simulated transmissions for demos.</p>
          </div>
        </Section>

        <Section icon={Cpu} title="AI explanation layer (optional)">
          <Toggle
            label="Use AI to phrase explanations"
            hint={hasKey ? 'Sends your triage summary (not raw notes) to Groq when online. Falls back to the offline rule engine.' : 'No Groq API key configured (set VITE_GROQ_API_KEY in .env). The offline rule engine is used.'}
            checked={s.aiEnabled}
            disabled={!hasKey}
            onChange={(v) => update({ aiEnabled: v })}
          />
          <p className="muted mt-2 text-xs">OFF by default. VITALIS is 100% functional without it. Guardrails: never diagnoses, always appends the rule engine's triage level and escalation path.</p>
        </Section>

        <Section icon={Lock} title="Privacy & passcode">
          {s.passcodeHash ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm">Passcode lock is ON.</p>
              <button className="btn-ghost" onClick={() => update({ passcodeHash: null, passcodeSalt: null })}>
                Remove passcode
              </button>
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (pass.length < 4) return toast({ title: 'Use at least 4 digits', level: 'monitor' });
                const { hash, salt } = await hashPasscode(pass);
                await update({ passcodeHash: hash, passcodeSalt: salt });
                setPass('');
                toast({ title: 'Passcode set', body: 'VITALIS will lock on next launch or via the lock button', level: 'nominal' });
              }}
            >
              <label htmlFor="pc" className="sr-only">
                New passcode
              </label>
              <input id="pc" className="field" type="password" inputMode="numeric" placeholder="New passcode (4+ digits)" value={pass} onChange={(e) => setPass(e.target.value)} />
              <button className="btn-primary shrink-0">Set</button>
            </form>
          )}
          <p className="muted mt-3 text-xs">Hashed with PBKDF2-SHA-256 (120k iterations) via WebCrypto. {signedIn ? 'Journal notes are synced to your account only: the crew medical officer and the ground team cannot see them.' : 'Journal notes stay on this device and are hidden from the CMO view.'}</p>
        </Section>

        <Section icon={Database} title="Your data">
          <div className="grid gap-2 sm:grid-cols-3">
            <button className="btn-ghost" onClick={async () => downloadBlob(new Blob([JSON.stringify(await exportData(), null, 2)], { type: 'application/json' }), `vitalis-export-${new Date().toISOString().slice(0, 10)}.json`)}>
              <Download className="h-4 w-4" aria-hidden /> Export JSON
            </button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" aria-hidden /> Import JSON
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                if (confirm('Permanently delete ALL VITALIS data on this device?')) {
                  await wipe();
                  navigate('dashboard');
                }
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Wipe all data
            </button>
          </div>
          <p className="muted mt-3 text-xs">
            Switching phone or laptop, or battery running low? Use{' '}
            <a href="#/devices" className="font-semibold text-accent hover:underline">
              Devices &amp; Sync
            </a>{' '}
            to merge data between your devices (Import JSON above replaces everything).
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="sr-only"
            aria-label="Import file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const data: unknown = JSON.parse(await f.text());
                if (!isExportBundle(data)) throw new Error('Not a VITALIS export');
                await importData(data);
                toast({ title: 'Data imported', level: 'nominal' });
              } catch (err) {
                toast({ title: 'Import failed', body: err instanceof Error ? err.message : 'Invalid file', level: 'act' });
              }
            }}
          />
        </Section>

        {!signedIn && (
        <Section icon={UserPlus} title="Crew">
          <form
            className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newCrew.name) return;
              await addCrew({ name: newCrew.name, callsign: (newCrew.callsign || newCrew.name.split(' ')[0]).toUpperCase(), role: 'Crew Member', age: 40, color: '#2dd4bf' });
              setNewCrew({ name: '', callsign: '' });
            }}
          >
            <label className="sr-only" htmlFor="ncn">
              Name
            </label>
            <input id="ncn" className="field" placeholder="Name" value={newCrew.name} onChange={(e) => setNewCrew({ ...newCrew, name: e.target.value })} />
            <label className="sr-only" htmlFor="ncc">
              Callsign
            </label>
            <input id="ncc" className="field uppercase" placeholder="Callsign" value={newCrew.callsign} onChange={(e) => setNewCrew({ ...newCrew, callsign: e.target.value })} />
            <button className="btn-primary">Add</button>
          </form>
        </Section>
        )}

        <div className="lg:col-span-2">
          <Section icon={SlidersHorizontal} title="Triage thresholds" id="thresholds">
            <p className="muted mb-3 text-sm">{DISCLAIMER} Values come from engine/thresholds.ts; each has a cited source. Edits are stored locally.</p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label htmlFor="thi" className="sr-only">
                Indicator
              </label>
              <select id="thi" className="field w-auto" value={thInd} onChange={(e) => setThInd(e.target.value as IndicatorId)}>
                {INDICATOR_IDS.map((i) => (
                  <option key={i} value={i}>
                    {INDICATORS[i].label}
                  </option>
                ))}
              </select>
              <button
                className="btn-ghost"
                onClick={() => {
                  const o = { ...s.thresholdOverrides };
                  delete o[thInd];
                  void update({ thresholdOverrides: o });
                }}
              >
                <RotateCcw className="h-4 w-4" aria-hidden /> Reset to default
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {BAND_KEYS.map((k) => (
                <div key={k}>
                  <label htmlFor={`b-${k}`} className="label text-xs">
                    {BAND_LABEL[k]} <span className="sr-only">{k}</span>
                  </label>
                  <input id={`b-${k}`} className="field px-2 text-center" type="number" step="any" value={bands[k] ?? ''} onChange={(e) => setBand(k, e.target.value)} placeholder="—" />
                </div>
              ))}
            </div>
            <p className="muted mt-2 text-xs">
              Mode: {THRESHOLDS[thInd].mode}
              {THRESHOLDS[thInd].mode === 'relativeToStart' && ' (% change from mission start)'}
              {THRESHOLDS[thInd].mode === 'envScaled' && ` (multiples of ${env.baselineDoseMsvPerDay} mSv/day for ${env.short})`} · Source: {THRESHOLDS[thInd].source}
            </p>
          </Section>
        </div>

        <div className="lg:col-span-2">
          <Section icon={ScrollText} title="Combination rules (transparent)">
            <ul className="grid gap-2 sm:grid-cols-2">
              {RULESET.map((r) => (
                <li key={r.id} className="rounded-xl bg-white/5 p-3 text-sm">
                  <span className="font-semibold">{r.name}</span>
                  <span className="muted block text-xs">{r.description}</span>
                </li>
              ))}
              <li className="rounded-xl bg-white/5 p-3 text-sm">
                <span className="font-semibold">Personal baseline</span>
                <span className="muted block text-xs">14-day mean ± SD (excl. last 3 days). |z| ≥ 2 → 🟡; 3-day sustained trend (each |z| ≥ 1.5) → 🟡; both → 🟠</span>
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
