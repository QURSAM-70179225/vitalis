import { type ReactNode, useEffect, useState } from 'react';
import { Starfield } from '@/components/Starfield';
import {
  Activity,
  Award,
  BookOpenCheck,
  Brain,
  CalendarClock,
  ClipboardCheck,
  HeartPulse,
  LayoutDashboard,
  Lock,
  Menu,
  MessageCircleQuestion,
  Radio,
  Satellite,
  Settings as SettingsIcon,
  Smartphone,
  ShieldAlert,
  Stethoscope,
  UserRound,
  Users,
  X,
  Cloud,
  CloudOff,
  Library,
  Map as MapIcon,
  MonitorDot,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '@/store/useApp';
import { navigate, useRoute, type PageId } from '@/hooks/useRoute';
import { useMissionContext, useTriage } from '@/hooks/useMission';
import { formatDelay } from '@/data/environments';
import { cn, timeAgo } from '@/utils';
import { StatusBadge } from './ui';

interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
  cmoOnly?: boolean;
}

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'live', label: 'Live Monitor', icon: Radio },
  { id: 'checkin', label: 'Check-In', icon: ClipboardCheck },
  { id: 'trends', label: 'Trends', icon: Activity },
  { id: 'journey', label: 'Health Journey', icon: MapIcon },
  { id: 'cognitive', label: 'Mind', icon: Brain },
  { id: 'guidance', label: 'Guidance', icon: BookOpenCheck },
  { id: 'schedule', label: 'Schedule', icon: CalendarClock },
  { id: 'crew', label: 'Crew', icon: Users },
  { id: 'ground', label: 'Ground Link', icon: Satellite },
  { id: 'achievements', label: 'Achievements', icon: Award },
  { id: 'devices', label: 'Devices & Sync', icon: Smartphone },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'about', label: 'About & Sources', icon: Library },
];

const CONSOLE_ITEM: NavItem = { id: 'console', label: 'Ground Console', icon: MonitorDot };
const GROUND_PAGES: PageId[] = ['console', 'dashboard', 'trends', 'journey', 'crew', 'guidance', 'devices', 'settings', 'about'];

/** Navigation for the current account: Mission Control sees the console, not personal health pages. */
export function useNav(): NavItem[] {
  const cloud = useApp((s) => s.cloud);
  const demo = useApp((s) => s.mission?.demo ?? false);
  const signedIn = !!cloud.userId && !demo;
  const all = [CONSOLE_ITEM, ...NAV];
  if (!signedIn) return [...NAV.slice(0, 10), CONSOLE_ITEM, ...NAV.slice(10)];
  if (cloud.role === 'ground') return GROUND_PAGES.map((id) => all.find((n) => n.id === id)!);
  if (cloud.role === 'cmo') return [...NAV.slice(0, 10), CONSOLE_ITEM, ...NAV.slice(10)];
  return NAV.filter((n) => n.id !== 'crew');
}

function SyncBadge() {
  const cloud = useApp((s) => s.cloud);
  const meta: Record<string, { label: string; cls: string; icon: typeof Cloud }> = {
    synced: { label: 'Synced', cls: 'text-nominal', icon: Cloud },
    syncing: { label: 'Syncing', cls: 'text-accent', icon: RefreshCw },
    offline: { label: 'Offline', cls: 'text-monitor', icon: CloudOff },
    error: { label: 'Sync issue', cls: 'text-act', icon: CloudOff },
    checking: { label: 'Connecting', cls: 'text-slate-300', icon: RefreshCw },
  };
  const m = meta[cloud.state] ?? meta.synced;
  const label = cloud.pending > 0 ? `${m.label} · ${cloud.pending} waiting` : m.label;
  return (
    <a
      href="#/settings"
      onClick={() => setTimeout(() => document.getElementById('waiting-uploads')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400)}
      className={cn('chip focus-ring hidden h-9 whitespace-nowrap md:inline-flex', m.cls)}
      title={cloud.error ?? (cloud.lastSync ? `Last sync ${timeAgo(cloud.lastSync)}` : 'Cloud sync')}
      aria-label={`Cloud sync: ${label}. Open details`}
    >
      <m.icon className={cn('h-3.5 w-3.5', cloud.state === 'syncing' && 'animate-spin')} aria-hidden /> {label}
    </a>
  );
}

const MOBILE_PRIMARY: PageId[] = ['dashboard', 'live', 'checkin', 'trends'];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-teal text-space-950 shadow-glow">
        <HeartPulse className="h-5 w-5" aria-hidden />
      </span>
      <span className="leading-none">
        <span className="block font-display text-lg font-bold tracking-[0.2em]">VITALIS</span>
        <span className="hidden text-[10px] uppercase tracking-[0.2em] text-slate-400 2xl:block">Health Command</span>
      </span>
    </span>
  );
}

function MissionBar() {
  const mission = useApp((s) => s.mission)!;
  const crew = useApp((s) => s.crew);
  const role = useApp((s) => s.role);
  const setRole = useApp((s) => s.setRole);
  const setActiveCrew = useApp((s) => s.setActiveCrew);
  const setCalm = useApp((s) => s.setCalm);
  const setAssistant = useApp((s) => s.setAssistant);
  const lock = useApp((s) => s.lock);
  const hasPass = useApp((s) => !!s.settings.passcodeHash);
  const { env, day, delaySec, crewMember } = useMissionContext();
  const triage = useTriage();
  const cloud = useApp((s) => s.cloud);
  const signedIn = !!cloud.userId && !mission.demo;
  const cloudRole = cloud.role;
  const myId = cloud.userId;
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const stat = (label: string, value: ReactNode, tour?: string) => (
    <div className="min-w-0 shrink px-3" data-tour={tour}>
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="truncate font-display text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-space-950/80 backdrop-blur-xl" data-tour="missionbar">
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <button onClick={() => navigate('dashboard')} className="focus-ring rounded-lg" aria-label="VITALIS home">
          <Logo />
        </button>
        <div className="ml-2 hidden flex-1 items-center divide-x divide-white/10 xl:flex">
          {stat('Mission day', `SOL ${day}`)}
          {stat('Environment', env.short)}
          {stat(
            'Comm delay (1-way)',
            <span className={delaySec >= 60 ? 'text-monitor' : 'text-nominal'}>{formatDelay(delaySec)}</span>,
          )}
          {stat('Ground sync', timeAgo(mission.lastGroundSync))}
          <div className="hidden 2xl:block">{stat('Link', online ? <span className="text-nominal">Online · local-first</span> : <span className="text-monitor">Offline · fully functional</span>)}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {triage && <StatusBadge level={triage.overall} size="sm" short className="hidden sm:inline-flex" />}
          {signedIn && <SyncBadge />}
          <label className="sr-only" htmlFor="crew-select">
            Active crew member
          </label>
          <div className={cn('relative hidden', (!signedIn || cloudRole !== 'astronaut') && 'sm:block')}>
            <UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <select
              id="crew-select"
              className="field h-10 w-[190px] min-w-0 py-0 pl-8 pr-8 text-sm"
              value={crewMember?.id}
              onChange={(e) => setActiveCrew(e.target.value)}
            >
              {crew
                .filter((c) => c.missionRole !== 'ground')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.callsign} · {c.name}
                    {signedIn && c.id === myId ? ' (you)' : ''}
                  </option>
                ))}
            </select>
          </div>
          {signedIn ? (
            <span className="chip hidden h-9 whitespace-nowrap md:inline-flex" title={cloud.email ?? undefined}>
              {cloudRole === 'ground' ? <Satellite className="h-3.5 w-3.5 text-accent" aria-hidden /> : cloudRole === 'cmo' ? <Stethoscope className="h-3.5 w-3.5 text-accent" aria-hidden /> : <UserRound className="h-3.5 w-3.5 text-accent" aria-hidden />}
              {cloudRole === 'ground' ? 'Mission Control' : cloudRole === 'cmo' ? 'CMO' : 'Astronaut'}
            </span>
          ) : (
          <div className="hidden rounded-xl border border-white/10 bg-white/5 p-0.5 md:flex" role="group" aria-label="Role" data-tour="role">
            {(['astronaut', 'cmo'] as const).map((r) => (
              <button
                key={r}
                aria-pressed={role === r}
                onClick={() => {
                  setRole(r);
                  if (r === 'cmo') navigate('crew');
                }}
                className={cn('focus-ring flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold', role === r ? 'bg-accent text-space-950' : 'text-slate-300')}
              >
                {r === 'astronaut' ? <UserRound className="h-3.5 w-3.5" aria-hidden /> : <Stethoscope className="h-3.5 w-3.5" aria-hidden />}
                {r === 'astronaut' ? 'Astronaut' : 'CMO'}
              </button>
            ))}
          </div>
          )}
          <button className="btn-icon btn-ghost" onClick={() => setAssistant(true)} aria-label="Open health assistant" title="Health assistant" data-tour="assistant">
            <MessageCircleQuestion className="h-5 w-5" />
          </button>
          <button className="btn-icon btn-ghost text-critical" onClick={() => setCalm(true)} aria-label="Calm mode: emergency checklist" title="Calm mode">
            <ShieldAlert className="h-5 w-5" />
          </button>
          {hasPass && (
            <button className="btn-icon btn-ghost hidden sm:inline-flex" onClick={lock} aria-label="Lock app" title="Lock">
              <Lock className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      {/* compact mission strip for tablet/phone */}
      <div className="flex items-center gap-3 overflow-x-auto border-t border-white/5 px-4 py-1.5 text-xs text-slate-300 xl:hidden">
        <span className="whitespace-nowrap font-semibold text-accent">SOL {day}</span>
        <span className="whitespace-nowrap">{env.short}</span>
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Radio className="h-3 w-3" aria-hidden /> {formatDelay(delaySec)}
        </span>
        <span className="whitespace-nowrap">Sync {timeAgo(mission.lastGroundSync)}</span>
        <span className="whitespace-nowrap sm:hidden">{crewMember?.callsign}</span>
        <span className={cn('whitespace-nowrap', online ? 'text-nominal' : 'text-monitor')}>{online ? 'Online' : 'Offline OK'}</span>
      </div>
    </header>
  );
}

function SideNav() {
  const { page } = useRoute();
  const role = useApp((s) => s.role);
  const nav = useNav();
  return (
    <nav aria-label="Main" className="sticky top-[60px] hidden h-[calc(100vh-60px)] w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/5 p-3 md:flex" data-tour="nav">
      {nav.map((n) => {
        const active = page === n.id || (page === 'system' && n.id === 'dashboard') || (page === 'camera' && n.id === 'checkin');
        return (
          <a
            key={n.id}
            href={`#/${n.id}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'focus-ring flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
              active ? 'bg-accent/15 text-accent' : 'text-slate-300 hover:bg-white/5 hover:text-white',
            )}
          >
            <n.icon className="h-5 w-5" aria-hidden />
            {n.label}
            {n.id === 'crew' && role === 'cmo' && <span className="ml-auto rounded bg-accent/20 px-1.5 text-[10px] text-accent">CMO</span>}
          </a>
        );
      })}
      <SideNote />
    </nav>
  );
}

function SideNote() {
  const signedIn = useApp((s) => !!s.cloud.userId && !s.mission?.demo);
  return (
    <p className="mt-auto px-3 pt-4 text-[10px] leading-relaxed text-slate-500">
      {signedIn
        ? 'Works offline. Saved on this device first, then synced to your mission when a link is available.'
        : 'All data stays on this device. Nothing is sent unless you tap “Send to Ground”.'}
    </p>
  );
}

function BottomNav() {
  const { page } = useRoute();
  const [more, setMore] = useState(false);
  const nav = useNav();
  const isGround = nav[0]?.id === 'console';
  const primaryIds: PageId[] = isGround ? ['console', 'dashboard', 'trends', 'crew'] : MOBILE_PRIMARY;
  const primary = nav.filter((n) => primaryIds.includes(n.id));
  const rest = nav.filter((n) => !primaryIds.includes(n.id));
  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-space-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {primary.map((n) => (
          <a key={n.id} href={`#/${n.id}`} aria-current={page === n.id ? 'page' : undefined} className={cn('focus-ring flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px]', page === n.id ? 'text-accent' : 'text-slate-400')}>
            <n.icon className="h-5 w-5" aria-hidden />
            {n.label}
          </a>
        ))}
        <button onClick={() => setMore(true)} className="focus-ring flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] text-slate-400" aria-label="More pages">
          <Menu className="h-5 w-5" aria-hidden />
          More
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 md:hidden" onClick={() => setMore(false)}>
          <div className="panel w-full rounded-b-none p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="More pages">
            <div className="mb-2 flex justify-between">
              <p className="eyebrow">Navigate</p>
              <button className="btn-icon btn-ghost" onClick={() => setMore(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {rest.map((n) => (
                <a key={n.id} href={`#/${n.id}`} onClick={() => setMore(false)} className="focus-ring flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl bg-white/5 text-xs">
                  <n.icon className="h-5 w-5 text-accent" aria-hidden />
                  {n.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <Starfield />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <MissionBar />
      <div className="relative z-10 flex">
        <SideNav />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-28 pt-5 outline-none sm:px-6 md:pb-10 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
