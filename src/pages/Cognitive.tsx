import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, HeartHandshake, Phone, Play, Square, Wind, Zap } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { useCrewData, useMissionContext, useTriage } from '@/hooks/useMission';
import { PVT, nextIsi, summarizePvt, wellbeingScore, type PvtSummary } from '@/engine/pvt';
import { computeBaseline } from '@/engine/baseline';
import { MOOD_EMOJI, MOOD_LABELS } from '@/data/indicators';
import { LEVEL_META } from '@/engine/status';
import { cn, uid } from '@/utils';
import { HazardBadges, PageHeader, Panel, Sparkline, StatusBadge } from '@/components/ui';

type Tab = 'pvt' | 'journal' | 'breathe';

export default function Cognitive() {
  const [tab, setTab] = useState<Tab>('pvt');
  const tabs: { id: Tab; label: string; icon: typeof Zap }[] = [
    { id: 'pvt', label: 'Reaction Time Test', icon: Zap },
    { id: 'journal', label: 'Mood journal', icon: HeartHandshake },
    { id: 'breathe', label: 'Breathing 4-7-8', icon: Wind },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Cognitive & behavioral health"
        title="Mind"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            Isolation, confinement and distance from home affect mood, sleep and reaction speed. <HazardBadges ids={['isolation', 'distance']} compact />
          </span>
        }
      />
      <div role="tablist" aria-label="Mind tools" className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} id={`tab-${t.id}`} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)} className={cn('btn', tab === t.id ? 'bg-accent text-space-950' : 'btn-ghost')}>
            <t.icon className="h-4 w-4" aria-hidden /> {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'pvt' && <PvtTest />}
        {tab === 'journal' && <Journal />}
        {tab === 'breathe' && <Breathing />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// PVT
// ---------------------------------------------------------------------------

type Phase = 'idle' | 'wait' | 'stim' | 'done';

function PvtTest() {
  const { day, crewMember } = useMissionContext();
  const { cognitive } = useCrewData();
  const addCognitive = useApp((s) => s.addCognitive);
  const toast = useApp((s) => s.toast);
  const [duration, setDuration] = useState(120);
  const [phase, setPhase] = useState<Phase>('idle');
  const [counter, setCounter] = useState(0);
  const [lastRt, setLastRt] = useState<number | null>(null);
  const [falseStart, setFalseStart] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<PvtSummary | null>(null);
  const rts = useRef<number[]>([]);
  const falseStarts = useRef(0);
  const stimAt = useRef(0);
  const endAt = useRef(0);
  const timer = useRef<number>();
  const raf = useRef<number>();
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  const baseline = useMemo(() => computeBaseline(cognitive.map((c) => c.meanRt), { exclude: 0, minReadings: 3 }), [cognitive]);

  const clear = () => {
    window.clearTimeout(timer.current);
    if (raf.current) cancelAnimationFrame(raf.current);
  };

  const finish = useCallback(async () => {
    clear();
    const s = summarizePvt(rts.current, falseStarts.current);
    setResult(s);
    setPhase('done');
    if (s.trials > 0 && crewMember) {
      await addCognitive({ id: uid('pvt-'), crewId: crewMember.id, day, timestamp: new Date().toISOString(), meanRt: s.meanRt, medianRt: s.medianRt, lapses: s.lapses, falseStarts: s.falseStarts, trials: s.trials });
      toast({ title: '+30 XP: reaction test logged', body: `Mean ${s.meanRt} ms · ${s.lapses} lapses`, level: 'nominal' });
    }
  }, [addCognitive, crewMember, day, toast]);

  const schedule = useCallback(() => {
    if (performance.now() >= endAt.current) return void finish();
    setPhase('wait');
    timer.current = window.setTimeout(() => {
      stimAt.current = performance.now();
      setPhase('stim');
      const tick = () => {
        const el = performance.now() - stimAt.current;
        setCounter(Math.round(el));
        if (el > PVT.timeoutMs) {
          rts.current.push(PVT.timeoutMs);
          setLastRt(PVT.timeoutMs);
          schedule();
          return;
        }
        if (phaseRef.current === 'stim') raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }, nextIsi());
  }, [finish]);

  const start = () => {
    rts.current = [];
    falseStarts.current = 0;
    setResult(null);
    setLastRt(null);
    endAt.current = performance.now() + duration * 1000;
    setRemaining(duration);
    schedule();
  };

  const respond = useCallback(() => {
    if (phaseRef.current === 'stim') {
      const rt = Math.round(performance.now() - stimAt.current);
      if (raf.current) cancelAnimationFrame(raf.current);
      rts.current.push(rt);
      setLastRt(rt);
      setFalseStart(false);
      phaseRef.current = 'wait';
      schedule();
    } else if (phaseRef.current === 'wait') {
      falseStarts.current += 1;
      setFalseStart(true);
    }
  }, [schedule]);

  useEffect(() => {
    if (phase !== 'wait' && phase !== 'stim') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        respond();
      }
    };
    window.addEventListener('keydown', onKey);
    const t = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((endAt.current - performance.now()) / 1000))), 250);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearInterval(t);
    };
  }, [phase, respond]);

  useEffect(() => clear, []);

  const running = phase === 'wait' || phase === 'stim';
  const pct = result && baseline ? ((result.meanRt - baseline.mean) / baseline.mean) * 100 : null;
  const resultLevel = !result ? 'nominal' : result.lapses >= 6 || result.meanRt >= 380 ? 'act' : result.lapses >= 3 || result.meanRt >= 320 || (pct ?? 0) > 15 ? 'monitor' : 'nominal';

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Psychomotor Vigilance Test</h2>
          {running && <span className="chip">{remaining}s left · {rts.current.length} responses</span>}
        </div>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            if (running) respond();
          }}
          disabled={!running}
          className={cn(
            'focus-ring relative grid h-72 w-full select-none place-items-center rounded-2xl border-2 transition-colors',
            phase === 'stim' ? 'border-monitor bg-monitor/10' : 'border-white/10 bg-black/40',
          )}
        >
          {phase === 'idle' && (
            <span className="muted max-w-sm px-4 text-sm">
              When the test starts, a counter appears at random times. Tap this area (or press Space) as fast as you can. Don't tap early.
            </span>
          )}
          {phase === 'wait' && (
            <span className="text-center">
              <span className="block h-4 w-4 rounded-full bg-white/20" aria-hidden />
              {falseStart && <span className="mt-3 block text-sm text-act">Too early! Wait for the counter.</span>}
              {lastRt !== null && !falseStart && <span className="muted mt-3 block text-sm">{lastRt} ms</span>}
            </span>
          )}
          {phase === 'stim' && <span className="numeral text-7xl text-monitor">{counter}</span>}
          {phase === 'done' && result && (
            <span className="text-center">
              <span className="numeral block text-6xl">{result.meanRt} ms</span>
              <span className="muted">mean reaction time</span>
            </span>
          )}
          <span className="sr-only">Response area. Tap or press Space when the counter appears.</span>
          <span className="sr-only" aria-live="assertive">
            {phase === 'stim' ? 'Now' : ''}
          </span>
        </button>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!running ? (
            <>
              <button className="btn-primary btn-lg" onClick={start}>
                <Play className="h-5 w-5" aria-hidden /> {phase === 'done' ? 'Run again' : 'Start test'}
              </button>
              <label className="flex items-center gap-2 text-sm">
                Duration
                <select className="field h-11 w-auto py-0" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  <option value={120}>2 min (standard)</option>
                  <option value={30}>30 s (demo)</option>
                </select>
              </label>
            </>
          ) : (
            <button className="btn-ghost btn-lg" onClick={finish}>
              <Square className="h-5 w-5" aria-hidden /> Stop & score
            </button>
          )}
        </div>
      </Panel>

      <div className="flex flex-col gap-5">
        {result && (
          <Panel aria-live="polite">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="h2">Result</h2>
              <StatusBadge level={resultLevel} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Mean RT', `${result.meanRt} ms`],
                ['Median RT', `${result.medianRt} ms`],
                ['Lapses (≥500 ms)', result.lapses],
                ['False starts', result.falseStarts],
                ['Fastest 10%', `${result.fastest10} ms`],
                ['Slowest 10%', `${result.slowest10} ms`],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-lg bg-white/5 p-2">
                  <dt className="muted text-xs">{k}</dt>
                  <dd className="numeral text-lg">{v}</dd>
                </div>
              ))}
            </dl>
            {pct !== null && (
              <p className="mt-3 text-sm">
                {Math.abs(pct) < 5 ? 'Right at your personal baseline.' : `${Math.abs(pct).toFixed(0)}% ${pct > 0 ? 'slower' : 'faster'} than your baseline (${baseline!.mean.toFixed(0)} ms).`}
                {resultLevel !== 'nominal' && ' Consider rest before critical tasks (EVA, docking, robotics).'}
              </p>
            )}
          </Panel>
        )}
        <Panel>
          <h2 className="h2 mb-2">History</h2>
          {cognitive.length ? (
            <>
              <Sparkline values={cognitive.slice(-30).map((c) => c.meanRt)} width={300} height={60} label="Reaction time trend, last 30 tests" />
              <ul className="mt-3 space-y-1 text-sm">
                {cognitive
                  .slice(-5)
                  .reverse()
                  .map((c) => (
                    <li key={c.id} className="flex justify-between rounded-lg bg-white/5 px-3 py-1.5">
                      <span>SOL {c.day}</span>
                      <span className="numeral">{c.meanRt} ms</span>
                      <span className={c.lapses >= 3 ? 'text-monitor' : 'muted'}>{c.lapses} lapses</span>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="muted text-sm">No tests yet. Take one every 3 days and before critical tasks.</p>
          )}
          <p className="muted mt-3 text-xs">PVT method: Basner & Dinges, Sleep 2011. Lapses are the most sensitive marker of sleep loss.</p>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mood journal
// ---------------------------------------------------------------------------

const WB_QUESTIONS = [
  'I feel connected to my crew',
  'I feel connected to family and friends at home',
  'I have enough privacy and personal time',
  'I feel in control of my workload',
  'I am finding meaning or enjoyment in the mission',
];

function Journal() {
  const { day, crewMember } = useMissionContext();
  const { journal } = useCrewData();
  const triage = useTriage();
  const addJournal = useApp((s) => s.addJournal);
  const toast = useApp((s) => s.toast);
  const [mood, setMood] = useState(4);
  const [note, setNote] = useState('');
  const [answers, setAnswers] = useState<number[]>(WB_QUESTIONS.map(() => 3));
  const [home, setHome] = useState(false);
  const lastHome = [...journal].reverse().find((j) => j.connectedHome);
  const daysSinceHome = lastHome ? day - lastHome.day : Infinity;
  const score = wellbeingScore(answers);
  const behavioral = triage?.systems.behavioral.level ?? 'nominal';

  const save = async () => {
    if (!crewMember) return;
    await addJournal({ id: uid('j-'), crewId: crewMember.id, day, timestamp: new Date().toISOString(), mood, note, wellbeing: score, answers, connectedHome: home });
    setNote('');
    toast({ title: '+20 XP: journal saved privately', body: `Wellbeing ${score}/100`, level: 'nominal' });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <Panel>
        <h2 className="h2 mb-4">Evening check-in</h2>
        <p className="label">How is your mood?</p>
        <div role="radiogroup" aria-label="Mood" className="mb-5 grid grid-cols-5 gap-2">
          {MOOD_EMOJI.map((e, i) => (
            <button key={e} role="radio" aria-checked={mood === i + 1} aria-label={MOOD_LABELS[i]} onClick={() => setMood(i + 1)} className={cn('focus-ring flex min-h-[72px] flex-col items-center justify-center rounded-2xl border', mood === i + 1 ? 'border-accent bg-accent/20' : 'border-white/10 bg-white/5')}>
              <span className="text-3xl">{e}</span>
              <span className="text-[10px]">{MOOD_LABELS[i]}</span>
            </button>
          ))}
        </div>
        <fieldset className="mb-5">
          <legend className="label">Isolation & confinement wellbeing (1 = disagree, 5 = agree)</legend>
          <div className="space-y-3">
            {WB_QUESTIONS.map((q, qi) => (
              <div key={q} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">{q}</span>
                <div className="flex gap-1" role="radiogroup" aria-label={q}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={answers[qi] === n}
                      aria-label={`${n}`}
                      onClick={() => setAnswers((a) => a.map((x, i) => (i === qi ? n : x)))}
                      className={cn('focus-ring h-11 w-11 rounded-xl border text-sm font-semibold', answers[qi] === n ? 'border-accent bg-accent text-space-950' : 'border-white/10 bg-white/5')}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm">
            Wellbeing score: <span className="numeral text-lg">{score}</span>/100
          </p>
        </fieldset>
        <label htmlFor="jnote" className="label">
          Private note (stays on this device; never sent to ground)
        </label>
        <textarea id="jnote" className="field mb-3 min-h-[110px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What went well today? What's on your mind?" />
        <label className="mb-4 flex min-h-[44px] items-center gap-3 text-sm">
          <input type="checkbox" className="h-6 w-6 accent-cyan-400" checked={home} onChange={(e) => setHome(e.target.checked)} />I connected with home today (message, video or call)
        </label>
        <button className="btn-primary btn-lg w-full" onClick={save}>
          Save journal entry
        </button>
      </Panel>
      <div className="flex flex-col gap-5">
        {daysSinceHome >= 5 && (
          <Panel className="border-accent/40">
            <h2 className="h2 mb-1 flex items-center gap-2">
              <Phone className="h-5 w-5 text-accent" aria-hidden /> Connect with home
            </h2>
            <p className="text-sm">
              {Number.isFinite(daysSinceHome) ? `It's been ${daysSinceHome} days since you logged contact with home.` : "You haven't logged contact with home yet."} Record a short video letter, or book your Private Family Conference.
            </p>
            <a href="#/guidance/connect-home" className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
              Ideas for staying connected →
            </a>
          </Panel>
        )}
        <Panel>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="h2">Behavioral status</h2>
            <StatusBadge level={behavioral} />
          </div>
          <p className="muted text-sm">{triage?.systems.behavioral.reasons[0] ?? LEVEL_META[behavioral].description}</p>
        </Panel>
        <Panel>
          <h2 className="h2 mb-2">Recent entries</h2>
          <Sparkline values={journal.slice(-20).map((j) => j.wellbeing)} width={300} height={50} color="#a78bfa" label="Wellbeing trend" />
          <ul className="mt-3 space-y-2">
            {journal
              .slice(-5)
              .reverse()
              .map((j) => (
                <li key={j.id} className="rounded-lg bg-white/5 p-2 text-sm">
                  <span className="mr-2">{MOOD_EMOJI[j.mood - 1]}</span>
                  <span className="font-semibold">SOL {j.day}</span> · wellbeing {j.wellbeing}
                  {j.note && <span className="muted block text-xs">“{j.note}”</span>}
                </li>
              ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4-7-8 breathing
// ---------------------------------------------------------------------------

const PHASES = [
  { label: 'Breathe in', secs: 4, scale: 1.0 },
  { label: 'Hold', secs: 7, scale: 1.0 },
  { label: 'Breathe out', secs: 8, scale: 0.55 },
] as const;

export function Breathing({ compact = false }: { compact?: boolean }) {
  const CYCLES = 4;
  const CYCLE_SECS = PHASES.reduce((a, p) => a + p.secs, 0);
  const [running, setRunning] = useState(false);
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (t >= CYCLE_SECS * CYCLES) {
      setRunning(false);
      setT(0);
    }
  }, [t, CYCLE_SECS]);

  const cycle = Math.floor(t / CYCLE_SECS) + 1;
  let within = t % CYCLE_SECS;
  let phaseIdx = 0;
  while (within >= PHASES[phaseIdx].secs) {
    within -= PHASES[phaseIdx].secs;
    phaseIdx++;
  }
  const left = PHASES[phaseIdx].secs - within;
  const ph = PHASES[phaseIdx];
  return (
    <Panel className={cn('flex flex-col items-center text-center', compact && 'border-none bg-transparent')}>
      {!compact && <h2 className="h2 mb-1">4-7-8 breathing</h2>}
      <p className="muted mb-6 text-sm">In for 4, hold for 7, out for 8. Four cycles, about 76 seconds.</p>
      <div className="relative grid h-64 w-64 place-items-center" aria-live="polite">
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-br from-accent/40 to-accent-teal/20 shadow-glow"
          animate={{ scale: running ? ph.scale : 0.6 }}
          transition={{ duration: running ? (phaseIdx === 1 ? 0.3 : ph.secs) : 0.6, ease: 'easeInOut' }}
          aria-hidden
        />
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.p key={running ? ph.label : 'ready'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-display text-2xl font-semibold">
              {running ? ph.label : 'Ready'}
            </motion.p>
          </AnimatePresence>
          {running && <p className="numeral text-5xl">{left}</p>}
          {running && <p className="muted text-xs">Cycle {cycle} of {CYCLES}</p>}
        </div>
      </div>
      <button
        className="btn-primary btn-lg mt-6"
        onClick={() => {
          setT(0);
          setRunning((r) => !r);
        }}
      >
        {running ? <Square className="h-5 w-5" aria-hidden /> : <Brain className="h-5 w-5" aria-hidden />} {running ? 'Stop' : 'Start guided breathing'}
      </button>
    </Panel>
  );
}
