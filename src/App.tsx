import { Suspense, lazy, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { useRoute } from '@/hooks/useRoute';
import { Layout } from '@/components/Layout';
import { Toasts } from '@/components/Toasts';
import { Onboarding } from '@/pages/Onboarding';
import { LockScreen } from '@/pages/LockScreen';
import { Dashboard } from '@/pages/Dashboard';
import { CalmMode } from '@/features/calm/CalmMode';
import { AppEffects } from '@/features/AppEffects';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cloudConfigured, demoRequested } from '@/cloud/client';
import { startCloud } from '@/cloud/sync';
import { AuthScreen, MissionSetup } from '@/pages/Auth';
import { OwnDataGuard } from '@/components/OwnDataGuard';

const CheckIn = lazy(() => import('@/pages/CheckIn'));
const Trends = lazy(() => import('@/pages/Trends'));
const SystemDetail = lazy(() => import('@/pages/SystemDetail'));
const Cognitive = lazy(() => import('@/pages/Cognitive'));
const Guidance = lazy(() => import('@/pages/Guidance'));
const Schedule = lazy(() => import('@/pages/Schedule'));
const Crew = lazy(() => import('@/pages/Crew'));
const Ground = lazy(() => import('@/pages/Ground'));
const Achievements = lazy(() => import('@/pages/Achievements'));
const Settings = lazy(() => import('@/pages/Settings'));
const Camera = lazy(() => import('@/pages/Camera'));
const Live = lazy(() => import('@/pages/Live'));
const Console = lazy(() => import('@/pages/Console'));
const About = lazy(() => import('@/pages/About'));
const Journey = lazy(() => import('@/pages/Journey'));
const Devices = lazy(() => import('@/pages/Devices'));
const Assistant = lazy(() => import('@/features/assistant/Assistant'));
const Tour = lazy(() => import('@/features/tour/Tour'));

function Loading({ label }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden />
        <span className={label ? 'muted text-sm' : 'sr-only'}>{label ?? 'Loading'}</span>
      </div>
    </div>
  );
}

function Page() {
  const { page, param } = useRoute();
  switch (page) {
    case 'checkin': return <OwnDataGuard what="check-ins"><CheckIn /></OwnDataGuard>;
    case 'camera': return <OwnDataGuard what="camera vitals"><Camera /></OwnDataGuard>;
    case 'live': return <OwnDataGuard what="sensor data"><Live /></OwnDataGuard>;
    case 'console': return <Console />;
    case 'about': return <About />;
    case 'journey': return <Journey />;
    case 'devices': return <Devices />;
    case 'trends': return <Trends initial={param} />;
    case 'system': return <SystemDetail id={param} />;
    case 'cognitive': return <OwnDataGuard what="reaction tests or journal entries"><Cognitive /></OwnDataGuard>;
    case 'guidance': return <Guidance id={param} />;
    case 'schedule': return <Schedule />;
    case 'crew': return <Crew />;
    case 'ground': return <Ground />;
    case 'achievements': return <Achievements />;
    case 'settings': return <Settings />;
    default: return <Dashboard />;
  }
}

function PageWithBoundary() {
  const { page, param } = useRoute();
  return (
    <ErrorBoundary resetKey={`${page}/${param ?? ''}`}>
      <Suspense fallback={<Loading />}>
        <Page />
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  const ready = useApp((s) => s.ready);
  const mission = useApp((s) => s.mission);
  const locked = useApp((s) => s.locked);
  const calm = useApp((s) => s.calmMode);
  const tourOpen = useApp((s) => s.tourOpen);
  const assistantOpen = useApp((s) => s.assistantOpen);
  const hc = useApp((s) => s.settings.highContrast);
  const rm = useApp((s) => s.settings.reducedMotion);
  const init = useApp((s) => s.init);
  const cloud = useApp((s) => s.cloud);

  useEffect(() => {
    void (async () => {
      await init();
      // One-click judge link: /?demo=1 (add &tour=1 for the guided tour)
      const q = new URLSearchParams(window.location.search);
      let hasSession = false;
      try {
        hasSession = !!localStorage.getItem('vitalis-auth');
      } catch {
        /* storage blocked */
      }
      if (q.has('demo') && !useApp.getState().mission?.demo) {
        if (cloudConfigured() && hasSession) {
          // Never overwrite a signed-in user's real data (and unsynced outbox) with the demo.
          useApp.getState().toast({ title: 'Demo not loaded', body: 'You are signed in. Sign out in Settings to try the demo.', level: 'monitor' });
        } else {
          await useApp.getState().loadDemo();
          if (q.has('tour')) useApp.getState().setTour(true);
        }
      }
      if (cloudConfigured() && !useApp.getState().mission?.demo) startCloud();
    })();
  }, [init]);
  useEffect(() => {
    document.documentElement.classList.toggle('hc', hc);
    document.documentElement.classList.toggle('reduce-motion', rm);
  }, [hc, rm]);

  if (!ready) return <Loading />;
  if (locked) return <LockScreen />;
  // Real accounts (Supabase configured): sign in → join a mission → app. Demo stays local.
  const cloudGate = cloudConfigured() && !mission?.demo && !demoRequested();
  if (cloudGate) {
    if (cloud.state === 'disabled' || cloud.state === 'checking') return <Loading />;
    if (cloud.state === 'signed-out' || !cloud.userId) return <><AuthScreen /><Toasts /></>;
    if (cloud.needsMission) return <><MissionSetup /><Toasts /></>;
    if (!mission) return <Loading label={cloud.state === 'offline' ? 'Offline: connect once to download your mission.' : 'Syncing your mission…'} />;
  }
  if (!mission) return <><Onboarding /><Toasts /></>;

  return (
    <>
      <Layout>
        <PageWithBoundary />
      </Layout>
      <AppEffects />
      {calm && <CalmMode />}
      <ErrorBoundary>
        <Suspense fallback={null}>
          {assistantOpen && <Assistant />}
          {tourOpen && <Tour />}
        </Suspense>
      </ErrorBoundary>
      <Toasts />
    </>
  );
}
