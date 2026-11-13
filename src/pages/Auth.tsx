import { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, Loader2, LogIn, LogOut, PlayCircle, Rocket, Satellite, ShieldCheck, Stethoscope, UserPlus, UserRound, Users } from 'lucide-react';
import type { EnvironmentId, Role } from '@/types';
import { useApp } from '@/store/useApp';
import { createMission, joinMission, resetPassword, signIn, signOut, signUp } from '@/cloud/sync';
import { Logo } from '@/components/Layout';
import { cn } from '@/utils';
import { EnvironmentPicker } from './Onboarding';

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="stars" aria-hidden />
      <main id="main" className={cn('relative z-10 mx-auto px-4 py-8 sm:py-12', wide ? 'max-w-5xl' : 'max-w-md')}>
        <Logo className="mb-8" />
        {children}
      </main>
    </div>
  );
}

function ErrorText({ msg }: { msg: string }) {
  return (
    <p role="alert" className="min-h-[1.25rem] text-sm text-critical">
      {msg}
    </p>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setInfo('');
    if (mode !== 'reset' && password.length < 8) return setErr('Password must be at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'in') await signIn(email.trim(), password);
      else if (mode === 'up') {
        const r = await signUp(email.trim(), password, name.trim() || 'Astronaut', (callsign.trim() || name.split(' ')[0] || 'CREW').toUpperCase());
        if (r.needsConfirmation) {
          setInfo('Account created. We sent a confirmation link to your email. Open it, then sign in here.');
          setMode('in');
        }
      } else {
        await resetPassword(email.trim());
        setInfo('If that email has an account, a password-reset link is on its way.');
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel panel-pad">
        <div role="tablist" aria-label="Account" className="mb-5 grid grid-cols-2 rounded-xl border border-white/10 p-0.5">
          {(['in', 'up'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn('focus-ring h-11 rounded-lg text-sm font-semibold', mode === m ? 'bg-accent text-space-950' : 'text-slate-300')}>
              {m === 'in' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
        <h1 className="h2 mb-1">{mode === 'in' ? 'Welcome back' : mode === 'up' ? 'Create your crew account' : 'Reset password'}</h1>
        <p className="muted mb-5 text-sm">
          {mode === 'up' ? 'Create it once. After that, VITALIS keeps you signed in and works even with no connection.' : mode === 'reset' ? 'Enter the email you signed up with.' : 'Your health data syncs securely with your mission team.'}
        </p>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'up' && (
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <div>
                <label className="label" htmlFor="nm">
                  Full name
                </label>
                <input id="nm" className="field" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
              <div>
                <label className="label" htmlFor="cs">
                  Callsign
                </label>
                <input id="cs" className="field uppercase" value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="ORION" maxLength={20} />
              </div>
            </div>
          )}
          <div>
            <label className="label" htmlFor="em">
              Email
            </label>
            <input id="em" className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          {mode !== 'reset' && (
            <div>
              <label className="label" htmlFor="pw">
                Password
              </label>
              <input id="pw" className="field" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />
            </div>
          )}
          <ErrorText msg={err} />
          {info && (
            <p role="status" className="rounded-lg bg-nominal/10 p-3 text-sm text-nominal">
              {info}
            </p>
          )}
          <button className="btn-primary btn-lg w-full" disabled={busy}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : mode === 'in' ? <LogIn className="h-5 w-5" aria-hidden /> : mode === 'up' ? <UserPlus className="h-5 w-5" aria-hidden /> : <KeyRound className="h-5 w-5" aria-hidden />}
            {mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
          </button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <button className="text-accent hover:underline" onClick={() => setMode(mode === 'reset' ? 'in' : 'reset')}>
            {mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
          </button>
        </div>
        <p className="muted mt-5 flex items-start gap-2 text-xs">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-nominal" aria-hidden />
          Passwords are handled by Supabase Auth and stored only as secure hashes. Your crewmates can't see your health data; only your Crew Medical Officer and mission ground team can.
        </p>
      </motion.div>
      <a href="/?demo=1&tour=1" className="btn-ghost mt-4 w-full">
        <PlayCircle className="h-5 w-5" aria-hidden /> Try the 90-day demo without an account
      </a>
    </Shell>
  );
}

const ROLE_OPTIONS: { id: Role; label: string; hint: string; icon: typeof UserRound }[] = [
  { id: 'astronaut', label: 'Astronaut (e.g. Commander)', hint: 'Records your own health data', icon: UserRound },
  { id: 'cmo', label: 'Crew Medical Officer', hint: 'Astronaut who can also see the crew', icon: Stethoscope },
  { id: 'ground', label: 'Mission Control (ground)', hint: 'Flight surgeon / engineer on Earth', icon: Satellite },
];

export function MissionSetup() {
  const name = useApp((s) => s.cloud.name);
  const email = useApp((s) => s.cloud.email);
  const [missionName, setMissionName] = useState('ARES-1');
  const [env, setEnv] = useState<EnvironmentId>('mars-transit');
  const [role, setRole] = useState<Role>('ground');
  const [code, setCode] = useState('');
  const [asCmo, setAsCmo] = useState(false);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [err, setErr] = useState('');

  const run = async (k: 'create' | 'join', fn: () => Promise<void>) => {
    setBusy(k);
    setErr('');
    try {
      await fn();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Shell wide>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Signed in as {email}</p>
          <h1 className="h1">Hi {name?.split(' ')[0] ?? 'there'}, join your mission</h1>
          <p className="muted mt-1 max-w-2xl text-sm">Each mission has two invite codes: a crew code for astronauts and a ground code for Mission Control. Your access is set by the code you use.</p>
        </div>
        <button className="btn-ghost" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </div>
      <ErrorText msg={err} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <form
          className="panel panel-pad"
          onSubmit={(e) => {
            e.preventDefault();
            void run('join', () => joinMission(code, asCmo));
          }}
        >
          <h2 className="h2 mb-1 flex items-center gap-2">
            <Users className="h-5 w-5 text-accent" aria-hidden /> Join with an invite code
          </h2>
          <p className="muted mb-4 text-sm">Ask your mission's ground team for the code.</p>
          <label className="label" htmlFor="code">
            Invite code
          </label>
          <input id="code" className="field mb-3 text-center font-mono text-2xl uppercase tracking-[0.3em]" required maxLength={12} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXXXXXX" />
          <label className="mb-4 flex min-h-[44px] items-center gap-3 text-sm">
            <input type="checkbox" className="h-6 w-6 accent-cyan-400" checked={asCmo} onChange={(e) => setAsCmo(e.target.checked)} />
            I'm the Crew Medical Officer (crew code only)
          </label>
          <button className="btn-primary btn-lg w-full" disabled={!!busy}>
            {busy === 'join' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Users className="h-5 w-5" aria-hidden />} Join mission
          </button>
        </form>

        <form
          className="panel panel-pad"
          onSubmit={(e) => {
            e.preventDefault();
            void run('create', () => createMission(missionName, env, role));
          }}
        >
          <h2 className="h2 mb-1 flex items-center gap-2">
            <Rocket className="h-5 w-5 text-accent" aria-hidden /> Create a new mission
          </h2>
          <p className="muted mb-4 text-sm">Usually done once by Mission Control. You'll get the invite codes in Settings.</p>
          <label className="label" htmlFor="mname">
            Mission name
          </label>
          <input id="mname" className="field mb-4" required value={missionName} onChange={(e) => setMissionName(e.target.value)} />
          <p className="label">Your role</p>
          <div role="radiogroup" aria-label="Your role" className="mb-4 grid gap-2 sm:grid-cols-3">
            {ROLE_OPTIONS.map((r) => (
              <button
                type="button"
                key={r.id}
                role="radio"
                aria-checked={role === r.id}
                onClick={() => setRole(r.id)}
                className={cn('focus-ring flex flex-col items-start gap-1 rounded-xl border p-3 text-left', role === r.id ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/5')}
              >
                <r.icon className="h-5 w-5 text-accent" aria-hidden />
                <span className="text-sm font-semibold">{r.label}</span>
                <span className="muted text-xs">{r.hint}</span>
              </button>
            ))}
          </div>
          <details className="mb-4">
            <summary className="cursor-pointer text-sm font-semibold">Mission environment</summary>
            <div className="mt-3">
              <EnvironmentPicker value={env} onChange={setEnv} />
            </div>
          </details>
          <button className="btn-primary btn-lg w-full" disabled={!!busy}>
            {busy === 'create' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Rocket className="h-5 w-5" aria-hidden />} Create mission
          </button>
        </form>
      </div>
    </Shell>
  );
}
