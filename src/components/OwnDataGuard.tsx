import type { ReactNode } from 'react';
import { ShieldCheck, UserRound } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { navigate } from '@/hooks/useRoute';
import { Panel } from './ui';

/**
 * With real accounts, health data can only be recorded for yourself. If a CMO or
 * Mission Control user is viewing a crewmate, explain and offer to switch back.
 */
export function OwnDataGuard({ children, what }: { children: ReactNode; what: string }) {
  const cloud = useApp((s) => s.cloud);
  const demo = useApp((s) => s.mission?.demo ?? false);
  const active = useApp((s) => s.mission?.activeCrewId);
  const setActiveCrew = useApp((s) => s.setActiveCrew);
  if (!cloud.userId || demo) return <>{children}</>;
  if (cloud.role === 'ground')
    return (
      <Panel className="mx-auto mt-10 max-w-lg text-center">
        <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-accent" aria-hidden />
        <p className="font-semibold">Mission Control accounts don't record {what}.</p>
        <p className="muted mt-1 text-sm">Crew members record their own data. Use the Ground Console to follow them.</p>
        <button className="btn-primary mt-4" onClick={() => navigate('console')}>
          Open Ground Console
        </button>
      </Panel>
    );
  if (active !== cloud.userId)
    return (
      <Panel className="mx-auto mt-10 max-w-lg text-center">
        <UserRound className="mx-auto mb-2 h-8 w-8 text-accent" aria-hidden />
        <p className="font-semibold">You're viewing a crewmate.</p>
        <p className="muted mt-1 text-sm">You can only record {what} for yourself.</p>
        <button className="btn-primary mt-4" onClick={() => void setActiveCrew(cloud.userId!)}>
          Switch back to me
        </button>
      </Panel>
    );
  return <>{children}</>;
}
