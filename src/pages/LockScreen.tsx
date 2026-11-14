import { useState } from 'react';
import { Starfield } from '@/components/Starfield';
import { Lock } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { hashPasscode } from '@/utils';
import { Logo } from '@/components/Layout';

export function LockScreen() {
  const settings = useApp((s) => s.settings);
  const unlock = useApp((s) => s.unlock);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.passcodeSalt) return unlock();
    const { hash } = await hashPasscode(code, settings.passcodeSalt);
    if (hash === settings.passcodeHash) unlock();
    else {
      setErr('Incorrect passcode');
      setCode('');
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center px-4">
      <Starfield />
      <form onSubmit={submit} className="panel relative z-10 w-full max-w-sm p-6 text-center">
        <Logo className="mb-6 justify-center" />
        <Lock className="mx-auto mb-3 h-8 w-8 text-accent" aria-hidden />
        <h1 className="h2 mb-1">Health data locked</h1>
        <p className="muted mb-5 text-sm">Your medical data is private. Enter your passcode.</p>
        <label htmlFor="pc" className="sr-only">
          Passcode
        </label>
        <input
          id="pc"
          className="field mb-3 text-center text-2xl tracking-[0.5em]"
          type="password"
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={!!err}
          aria-describedby="pc-err"
        />
        <p id="pc-err" role="alert" className="mb-3 min-h-[1.25rem] text-sm text-critical">
          {err}
        </p>
        <button className="btn-primary btn-lg w-full">Unlock</button>
      </form>
    </div>
  );
}
