import { useEffect, useState } from 'react';
import { Cloud, Copy, LogOut, RefreshCw, UserCog } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { cloudConfigured } from '@/cloud/client';
import { flushOutbox, bootstrap, missionCodes, signOut, updateProfile } from '@/cloud/sync';
import { WaitingUploads } from './WaitingUploads';
import { timeAgo } from '@/utils';
import { Panel } from '@/components/ui';

export function AccountPanel() {
  const cloud = useApp((s) => s.cloud);
  const demo = useApp((s) => s.mission?.demo ?? false);
  const me = useApp((s) => s.crew.find((c) => c.id === s.cloud.userId));
  const toast = useApp((s) => s.toast);
  const [codes, setCodes] = useState<{ crew_code: string; ground_code: string } | null>(null);
  const [name, setName] = useState(me?.name ?? '');
  const [callsign, setCallsign] = useState(me?.callsign ?? '');

  useEffect(() => {
    if (cloud.userId && !demo) missionCodes().then(setCodes).catch(() => setCodes(null));
  }, [cloud.userId, cloud.missionId, demo]);

  if (!cloudConfigured() || demo || !cloud.userId) {
    return (
      <Panel>
        <h2 className="h2 mb-2 flex items-center gap-2">
          <Cloud className="h-5 w-5 text-accent" aria-hidden /> Accounts & cloud sync
        </h2>
        <p className="muted text-sm">
          {demo && cloudConfigured()
            ? 'You are in the local demo. Wipe data (below) and reload to sign in with a real account.'
            : 'Not configured: this copy runs fully on this device. To enable crew accounts and Mission Control access, add your Supabase URL and anon key to .env (see docs/SUPABASE_SETUP.md).'}
        </p>
      </Panel>
    );
  }

  const copy = (t: string) => {
    void navigator.clipboard?.writeText(t);
    toast({ title: 'Copied', body: t, level: 'info' });
  };

  return (
    <Panel aria-labelledby="acct-h">
      <h2 id="acct-h" className="h2 mb-4 flex items-center gap-2">
        <UserCog className="h-5 w-5 text-accent" aria-hidden /> Account & sync
      </h2>
      <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="muted text-xs">Signed in as</dt>
          <dd className="font-medium">{cloud.email}</dd>
        </div>
        <div>
          <dt className="muted text-xs">Role</dt>
          <dd className="font-medium">{cloud.role === 'ground' ? 'Mission Control (ground)' : cloud.role === 'cmo' ? 'Crew Medical Officer' : 'Astronaut'}</dd>
        </div>
        <div>
          <dt className="muted text-xs">Sync</dt>
          <dd className="font-medium capitalize">
            {cloud.state}
            {cloud.pending ? ` · ${cloud.pending} waiting to upload` : ''}
            {cloud.lastSync ? ` · ${timeAgo(cloud.lastSync)}` : ''}
          </dd>
        </div>
      </dl>
      {(cloud.pending > 0 || cloud.error) && <WaitingUploads />}

      <form
        className="mb-4 grid gap-2 sm:grid-cols-[1fr_140px_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await updateProfile({ name: name.trim(), callsign: callsign.trim().toUpperCase() });
            toast({ title: 'Profile updated', level: 'nominal' });
          } catch (err) {
            toast({ title: 'Could not update profile', body: err instanceof Error ? err.message : '', level: 'act' });
          }
        }}
      >
        <label className="sr-only" htmlFor="pn">
          Name
        </label>
        <input id="pn" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <label className="sr-only" htmlFor="pc2">
          Callsign
        </label>
        <input id="pc2" className="field uppercase" value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="Callsign" maxLength={20} />
        <button className="btn-ghost">Save</button>
      </form>

      {codes && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {(
            [
              ['Crew invite code', codes.crew_code, 'Astronauts and the CMO join with this'],
              ['Ground invite code', codes.ground_code, 'Flight surgeons and engineers join with this'],
            ] as const
          ).map(([label, code, hint]) => (
            <div key={label} className="rounded-xl bg-white/5 p-3">
              <p className="muted text-xs">{label}</p>
              <p className="flex items-center justify-between gap-2">
                <span className="font-mono text-xl tracking-[0.2em]">{code}</span>
                <button className="btn-icon btn-ghost h-9 w-9" aria-label={`Copy ${label}`} onClick={() => copy(code)}>
                  <Copy className="h-4 w-4" />
                </button>
              </p>
              <p className="muted text-[11px]">{hint}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-ghost"
          onClick={async () => {
            await flushOutbox();
            await bootstrap();
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Sync now
        </button>
        <button
          className="btn-ghost"
          onClick={async () => {
            if (cloud.pending > 0 && !confirm(`${cloud.pending} changes have not been uploaded yet and will be lost. Sign out anyway?`)) return;
            await signOut();
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </div>
    </Panel>
  );
}
