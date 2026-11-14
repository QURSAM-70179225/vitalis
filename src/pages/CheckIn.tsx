import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Bluetooth,
  Camera,
  Keyboard,
  ScanText,
  CheckCircle2,
  Dumbbell,
  HeartPulse,
  LayoutDashboard,
  Moon,
  Satellite,
  Smile,
  Stethoscope,
  Timer,
  Utensils,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { ChannelId, CheckIn as CheckInT, IndicatorId, IndicatorValues, SymptomId } from '@/types';
import { useApp } from '@/store/useApp';
import { useCrewData, useMissionContext, useThresholds, useTriage } from '@/hooks/useMission';
import { INDICATORS } from '@/data/indicators';
import { navigate } from '@/hooks/useRoute';
import { escalationPlan } from '@/engine/escalation';
import { LEVEL_META } from '@/engine/status';
import { mean } from '@/engine/baseline';
import { uid, cn } from '@/utils';
import { AlertCard } from '@/components/AlertCard';
import { Disclaimer, PageHeader, StatusBadge } from '@/components/ui';
import { NumberField, ScaleField, SymptomGrid, liveLevel } from '@/features/checkin/fields';
import { freshReadings, type Reading } from '@/devices/hub';
import { CHANNELS } from '@/devices/channels';
import { ReportScanner } from '@/features/checkin/ReportScanner';

interface Step {
  title: string;
  hint: string;
  icon: LucideIcon;
  items?: IndicatorId[];
  symptoms?: boolean;
  review?: boolean;
}

const STEPS: Step[] = [
  { title: 'Heart & blood pressure', hint: 'Measure at rest, before exercise or coffee.', icon: HeartPulse, items: ['heartRate', 'systolic', 'diastolic'] },
  { title: 'Breathing & temperature', hint: 'Pulse oximeter, breath count, thermometer.', icon: Wind, items: ['spo2', 'respRate', 'temperature'] },
  { title: 'Sleep', hint: 'Last night, from your sleep log or watch.', icon: Moon, items: ['sleepHours', 'sleepQuality'] },
  { title: 'How are you feeling?', hint: 'Honest answers help VITALIS help you. This stays private.', icon: Smile, items: ['mood', 'stress', 'fatigue'] },
  { title: 'Fuel & body', hint: 'Glucose (fasting), fluids from the last 24 h, weekly body mass.', icon: Utensils, items: ['glucose', 'hydration', 'bodyMass'] },
  { title: 'Exercise & radiation', hint: 'Yesterday’s exercise minutes and your dosimeter reading.', icon: Dumbbell, items: ['exerciseResistive', 'exerciseAerobic', 'radiationDose'] },
  { title: 'Any symptoms?', hint: 'Tick everything you have noticed since your last check-in.', icon: Stethoscope, symptoms: true },
  { title: 'Review & submit', hint: 'Check your entries. You can go back to change anything.', icon: CheckCircle2, review: true },
];

/** Draft survives navigating to the camera and back. */
let draft: { values: IndicatorValues; skipped: IndicatorId[]; symptoms: SymptomId[]; notes: string; step: number; started: number; fromDevice: Partial<Record<IndicatorId, string>> } | null = null;

export default function CheckIn() {
  const { env, day, crewMember } = useMissionContext();
  const { checkIns } = useCrewData();
  const thresholds = useThresholds();
  const units = useApp((s) => s.settings.units);
  const addCheckIn = useApp((s) => s.addCheckIn);
  const toast = useApp((s) => s.toast);
  const cameraHr = useApp((s) => s.cameraHr);
  const setCameraHr = useApp((s) => s.setCameraHr);
  const triage = useTriage();

  const last = checkIns[checkIns.length - 1];
  const massSeries = checkIns.filter((c) => c.values.bodyMass !== undefined);
  const startMass = massSeries.length ? mean(massSeries.filter((c) => c.day < massSeries[0].day + 7).map((c) => c.values.bodyMass!)) : undefined;
  const lastMass = massSeries[massSeries.length - 1];
  const massDue = !lastMass || day - lastMass.day >= 7;

  const initial = useMemo(() => {
    if (draft) return draft;
    const values: IndicatorValues = {};
    for (const s of STEPS)
      for (const id of s.items ?? []) {
        values[id] = id === 'bodyMass' ? lastMass?.values.bodyMass ?? INDICATORS[id].default : last?.values[id] ?? INDICATORS[id].default;
      }
    if (!last) values.radiationDose = env.baselineDoseMsvPerDay;
    const skipped: IndicatorId[] = massDue ? [] : ['bodyMass'];
    // Auto-fill from connected sensors (readings from the last 30 min).
    const fromDevice: Partial<Record<IndicatorId, string>> = {};
    const fresh = freshReadings();
    for (const [ch, r] of Object.entries(fresh) as [ChannelId, Reading][]) {
      const ind = CHANNELS[ch].indicator;
      if (!ind) continue;
      values[ind] = Number(r.v.toFixed(2));
      fromDevice[ind] = r.source;
      const i = skipped.indexOf(ind);
      if (i >= 0) skipped.splice(i, 1);
    }
    // 24-h dose from the dosimeter stream (needs ≥ 1 h of one-minute samples).
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const doses = useApp.getState().vitals.filter((v) => v.crewId === crewMember?.id && v.ts > dayAgo && v.channels.doseRate !== undefined);
    if (doses.length >= 60) {
      values.radiationDose = Number(((doses.reduce((a, v) => a + v.channels.doseRate!, 0) / doses.length) * 24 / 1000).toFixed(2));
      fromDevice.radiationDose = 'dosimeter stream (24 h)';
    }
    return { values, skipped, symptoms: [] as SymptomId[], notes: '', step: 0, started: Date.now(), fromDevice };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [values, setValues] = useState<IndicatorValues>(initial.values);
  const [sources, setSources] = useState<Partial<Record<IndicatorId, string>>>(initial.fromDevice);
  const [scanOpen, setScanOpen] = useState(false);
  const [skipped, setSkipped] = useState<IndicatorId[]>(initial.skipped);
  const [symptoms, setSymptoms] = useState<SymptomId[]>(initial.symptoms);
  const [notes, setNotes] = useState(initial.notes);
  const [step, setStep] = useState(initial.step);
  const [submitted, setSubmitted] = useState(false);
  const started = useRef(initial.started);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    draft = submitted ? null : { values, skipped, symptoms, notes, step, started: started.current, fromDevice: sources };
  }, [values, skipped, symptoms, notes, step, submitted, sources]);

  useEffect(() => {
    // Read-and-clear atomically so the value is applied exactly once (StrictMode-safe).
    const hr = useApp.getState().cameraHr;
    if (!hr) return;
    setCameraHr(null);
    setValues((v) => ({ ...v, heartRate: Math.round(hr) }));
    setSkipped((s) => s.filter((x) => x !== 'heartRate'));
    toast({ title: `Camera heart rate applied: ${Math.round(hr)} bpm`, level: 'info' });
  }, [cameraHr, setCameraHr, toast]);

  useEffect(() => {
    if (submitted) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [submitted]);

  const cur = STEPS[step];
  const set = (id: IndicatorId, v: number) => setValues((x) => ({ ...x, [id]: v }));
  const lvl = (id: IndicatorId) => liveLevel(id, values[id] ?? 0, thresholds[id], env, startMass);
  const toggleSkip = (id: IndicatorId, s: boolean) => setSkipped((x) => (s ? [...x, id] : x.filter((y) => y !== id)));

  const submit = async () => {
    const final: IndicatorValues = {};
    for (const [k, v] of Object.entries(values) as [IndicatorId, number][]) {
      if (!skipped.includes(k)) final[k] = Math.round(v * 100) / 100;
    }
    const c: CheckInT = {
      id: uid('ci-'),
      crewId: crewMember!.id,
      day,
      timestamp: new Date().toISOString(),
      values: final,
      symptoms,
      notes: notes || undefined,
      source: Object.keys(sources).length >= 2 ? 'device' : 'manual',
    };
    await addCheckIn(c);
    draft = null;
    setSubmitted(true);
    toast({ title: '+50 XP: daily check-in complete', body: `Done in ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`, level: 'nominal' });
  };

  if (submitted && triage) return <CheckInResult />;

  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <>
      <PageHeader
        eyebrow={`Daily check-in · SOL ${day} · ${crewMember?.callsign}`}
        title={cur.title}
        subtitle={cur.hint}
        actions={
          <span className={cn('chip', elapsed > 180 && 'border-monitor text-monitor')} aria-label={`Elapsed time ${mmss}. Target under 3 minutes.`}>
            <Timer className="h-3.5 w-3.5" aria-hidden /> {mmss} / 3:00
          </span>
        }
      />
      <ol className="mb-5 flex gap-1.5" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex-1">
            <button
              onClick={() => setStep(i)}
              className={cn('focus-ring block h-2 w-full rounded-full transition', i < step ? 'bg-accent' : i === step ? 'bg-accent/70' : 'bg-white/10')}
              aria-label={`Step ${i + 1}: ${s.title}${i === step ? ' (current)' : ''}`}
              aria-current={i === step ? 'step' : undefined}
            />
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section aria-labelledby="how-h" className="panel mb-5 p-4">
          <h2 id="how-h" className="mb-3 text-sm font-semibold">How do you want to add today's numbers?</h2>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { icon: Keyboard, label: 'Type them in', hint: 'Use the boxes below', onClick: () => document.getElementById('main')?.querySelector('input')?.focus() },
              { icon: ScanText, label: 'Scan a report', hint: 'Photo or text of a report', onClick: () => setScanOpen(true) },
              { icon: Bluetooth, label: 'Connect a device', hint: 'Bluetooth, suit or wearable', onClick: () => navigate('live') },
              { icon: Camera, label: 'Use the camera', hint: 'Heart rate from your face', onClick: () => navigate('camera') },
            ].map((m) => (
              <button key={m.label} onClick={m.onClick} className="focus-ring flex min-h-[72px] items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-accent hover:bg-accent/10">
                <m.icon className="h-6 w-6 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="block text-sm font-semibold">{m.label}</span>
                  <span className="muted block text-xs">{m.hint}</span>
                </span>
              </button>
            ))}
          </div>
          {Object.keys(sources).length > 0 && (
            <p className="muted mt-3 text-xs">
              Already filled in for you: {Object.keys(sources).map((k) => INDICATORS[k as IndicatorId].label.toLowerCase()).join(', ')}. Check them and change anything that looks wrong.
            </p>
          )}
        </section>
      )}
      <ReportScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onUse={(v) => {
          setValues((x) => ({ ...x, ...v }));
          setSkipped((x) => x.filter((id) => !(id in v)));
          setSources((x) => ({ ...x, ...Object.fromEntries(Object.keys(v).map((k) => [k, 'scanned report'])) }));
          toast({ title: `${Object.keys(v).length} values added from the report`, body: 'Check each step and press Next.', level: 'info' });
        }}
      />
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
          {cur.items && (
            <div className="grid gap-4 lg:grid-cols-2">
              {cur.items.map((id) => {
                const meta = INDICATORS[id];
                if (meta.input === 'number')
                  return (
                    <div key={id} className={cn(cur.items!.length === 3 && id === cur.items![0] && 'lg:col-span-2')}>
                      <NumberField
                        id={id}
                        value={values[id] ?? meta.default}
                        onChange={(v) => set(id, v)}
                        units={units}
                        level={lvl(id)}
                        skipped={skipped.includes(id)}
                        onSkip={(s) => toggleSkip(id, s)}
                        optionalLabel={
                          sources[id] ? `${sources[id] === 'scanned report' ? '📄' : '📡'} From ${sources[id]}` : id === 'bodyMass' ? (massDue ? 'Weekly measurement due' : 'Weekly; not due today') : undefined
                        }
                      />
                      {id === 'heartRate' && (
                        <button className="btn-ghost mt-2 w-full" onClick={() => navigate('camera')}>
                          <Camera className="h-5 w-5" aria-hidden /> Use camera to estimate heart rate (experimental)
                        </button>
                      )}
                    </div>
                  );
                return <ScaleField key={id} id={id} value={values[id] ?? meta.default} onChange={(v) => set(id, v)} level={lvl(id)} />;
              })}
            </div>
          )}
          {cur.symptoms && (
            <>
              <SymptomGrid value={symptoms} onChange={setSymptoms} />
              <div className="panel mt-4 p-4">
                <label htmlFor="notes" className="label">
                  Notes for the CMO (optional, e.g. medication taken)
                </label>
                <textarea id="notes" className="field min-h-[88px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </>
          )}
          {cur.review && (
            <div className="panel panel-pad">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {STEPS.flatMap((s) => s.items ?? []).map((id) => (
                  <div key={id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
                    <span className="text-sm">{INDICATORS[id].label}</span>
                    {skipped.includes(id) ? (
                      <span className="muted text-xs">skipped</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="numeral">
                          {INDICATORS[id].input === 'number' ? Number((values[id] ?? 0).toFixed(2)) : values[id]}
                        </span>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_META[lvl(id)].color }} aria-label={LEVEL_META[lvl(id)].label} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm">
                <span className="font-semibold">Symptoms: </span>
                {symptoms.length ? symptoms.join(', ') : 'none'}
              </p>
              <Disclaimer className="mt-4" />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="sticky bottom-[68px] z-20 -mx-2 mt-6 flex justify-between gap-3 rounded-2xl border border-white/10 bg-space-950/90 p-2 backdrop-blur-xl md:bottom-4">
        <button className="btn-ghost btn-lg" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="h-5 w-5" aria-hidden /> Back
        </button>
        {cur.review ? (
          <button className="btn-primary btn-lg flex-1 sm:flex-none" onClick={submit}>
            <CheckCircle2 className="h-5 w-5" aria-hidden /> Submit check-in
          </button>
        ) : (
          <button className="btn-primary btn-lg flex-1 sm:flex-none" onClick={() => setStep((s) => s + 1)}>
            Next <ArrowRight className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>
    </>
  );
}

function CheckInResult() {
  const triage = useTriage()!;
  const { delaySec } = useMissionContext();
  const plan = escalationPlan(triage.overall, delaySec, triage.alerts[0]);
  const meta = LEVEL_META[triage.overall];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Check-in complete" title="Here’s what VITALIS found" />
      <section className={cn('panel panel-pad mb-5 border-2', meta.border)} aria-live="polite">
        <div className="flex flex-wrap items-center gap-4">
          <StatusBadge level={triage.overall} size="lg" />
          <p className="numeral text-2xl">Readiness {triage.readiness}</p>
        </div>
        <p className="mt-3 text-base font-semibold">{plan.headline}</p>
        <p className="muted text-sm">{plan.contact}</p>
      </section>
      {triage.alerts.length ? (
        <div className="space-y-3">
          {triage.alerts.slice(0, 5).map((a, i) => (
            <AlertCard key={a.id} alert={a} defaultOpen={i === 0} />
          ))}
        </div>
      ) : (
        <div className="panel panel-pad flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-nominal" aria-hidden />
          <p>All indicators are within your normal range and personal baseline. Great work. Keep up your countermeasures.</p>
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <button className="btn-primary btn-lg" onClick={() => navigate('dashboard')}>
          <LayoutDashboard className="h-5 w-5" aria-hidden /> Go to dashboard
        </button>
        {triage.overall !== 'nominal' && (
          <button className="btn-ghost btn-lg" onClick={() => navigate('ground')}>
            <Satellite className="h-5 w-5" aria-hidden /> Send to ground
          </button>
        )}
      </div>
      <Disclaimer className="mt-6" />
    </motion.div>
  );
}
