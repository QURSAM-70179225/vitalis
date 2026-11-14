import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BatteryCharging, BatteryLow, BatteryMedium, Bluetooth, Camera, CheckCircle2, Cloud, Download, HardDrive, Laptop, Radio, Send, Smartphone, Upload, Watch, WifiOff } from 'lucide-react';
import { PageHeader, Panel } from '@/components/ui';
import { useApp, type SyncPreview } from '@/store/useApp';
import { bluetoothSupported, useDevices } from '@/devices/hub';
import { describeAdded, isSyncBundle } from '@/engine/merge';
import type { SyncBundle } from '@/types';
import { navigate } from '@/hooks/useRoute';
import { downloadBlob } from '@/utils';
import { deviceName, persistStorage, shareFile, storageInfo, watchBattery, type BatteryInfo } from '@/utils/device';
import { canInstall, isInstalled, promptInstall, subscribeInstall } from '@/utils/install';
import { cloudConfigured } from '@/cloud/client';

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function Row({ ok, title, children }: { ok: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <CheckCircle2 className={ok ? 'mt-0.5 h-5 w-5 shrink-0 text-nominal' : 'mt-0.5 h-5 w-5 shrink-0 text-slate-500'} aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">
          {title} <span className="sr-only">{ok ? '(ready)' : '(not yet)'}</span>
        </p>
        {children && <div className="muted text-sm">{children}</div>}
      </div>
    </li>
  );
}

export default function Devices() {
  const toast = useApp((s) => s.toast);
  const exportSync = useApp((s) => s.exportSync);
  const receiveSync = useApp((s) => s.receiveSync);
  const cloud = useApp((s) => s.cloud);
  const mission = useApp((s) => s.mission);
  const online = useOnline();
  const cloudEnabled = cloudConfigured() && !mission?.demo;
  const installable = useSyncExternalStore(subscribeInstall, canInstall);
  const installed = isInstalled();
  const [battery, setBattery] = useState<BatteryInfo | null>(null);
  const [store, setStore] = useState<{ persisted: boolean; usedMb: number | null; quotaMb: number | null } | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const [incoming, setIncoming] = useState<{ bundle: SyncBundle; preview: SyncPreview } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const connectBluetooth = useDevices((s) => s.connectBluetooth);

  useEffect(() => watchBattery(setBattery), []);
  useEffect(() => {
    void storageInfo().then(setStore);
    void navigator.serviceWorker?.getRegistration().then((r) => setOfflineReady(!!r?.active));
  }, []);

  const ios = /iPhone|iPad/.test(navigator.userAgent);
  const low = battery && !battery.charging && battery.level <= 0.2;
  const BatteryIcon = battery?.charging ? BatteryCharging : low ? BatteryLow : BatteryMedium;

  const send = async () => {
    setBusy(true);
    try {
      const b = await exportSync();
      const name = `vitalis-sync-${deviceName().toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
      const file = new File([JSON.stringify(b)], name, { type: 'application/json' });
      const r = await shareFile(file, 'VITALIS hand-off file');
      if (r === 'unsupported') {
        downloadBlob(file, name);
        toast({ title: 'Hand-off file saved', body: 'Move it to your other device (USB cable, memory card, Bluetooth or Nearby Share), then open it there with "Receive".', level: 'nominal' });
      } else if (r === 'shared') toast({ title: 'Hand-off file sent', body: 'On the other device open VITALIS → Devices & sync → Receive.', level: 'nominal' });
    } finally {
      setBusy(false);
    }
  };

  const pick = async (f: File) => {
    try {
      const data: unknown = JSON.parse(await f.text());
      if (!isSyncBundle(data)) throw new Error('This is not a VITALIS hand-off file. (Full backups are restored in Settings → Your data.)');
      const preview = await receiveSync(data, true);
      setIncoming({ bundle: data, preview });
    } catch (err) {
      toast({ title: 'Could not read the file', body: err instanceof Error ? err.message : 'Invalid file', level: 'act' });
    }
  };

  const merge = async () => {
    if (!incoming) return;
    setBusy(true);
    try {
      const r = await receiveSync(incoming.bundle);
      toast({ title: r.total ? 'Devices are in sync' : 'Already in sync', body: r.total ? `Added ${describeAdded(r.added)}${r.updated ? ` and updated ${r.updated}` : ''}.` : 'This device already had everything in that file.', level: 'nominal' });
      setIncoming(null);
      if (r.adoptsMission) navigate('dashboard');
    } catch (err) {
      toast({ title: 'Sync failed, nothing was changed', body: err instanceof Error ? err.message : String(err), level: 'act' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Works with no internet"
        title="Devices & offline sync"
        subtitle="Use VITALIS as an app on your phone, tablet and laptop, connect your watch, and move your data from one device to another, even with no internet at all."
      />

      {low && (
        <div role="alert" className="panel mb-5 flex flex-wrap items-center gap-3 border-2 border-act/60 bg-act/10 p-4">
          <BatteryLow className="h-7 w-7 shrink-0 text-act" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Battery {Math.round(battery.level * 100)}%.</span> Send your data to another device now so you can carry on if this one runs out.
          </p>
          <button className="btn-primary" onClick={() => void send()} disabled={busy}>
            <Send className="h-4 w-4" aria-hidden /> Send to my other device
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="panel-pad">
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold">
            <HardDrive className="h-5 w-5 text-accent" aria-hidden /> This device
          </h2>
          <ul className="divide-y divide-white/5">
            <Row ok={offlineReady} title={offlineReady ? 'Works fully offline' : 'Offline mode is getting ready'}>
              {offlineReady ? 'Every page is saved on this device. You can turn off Wi-Fi and keep going.' : 'Open the app once while online; after that it works with no internet.'}
            </Row>
            <Row ok={!!store?.persisted} title={store?.persisted ? 'Your data is protected' : 'Protect your data from being cleared'}>
              {store?.persisted ? 'The browser will not delete your health data to free up space.' : (
                <button
                  className="btn-ghost mt-1"
                  onClick={async () => {
                    const ok = await persistStorage();
                    setStore(await storageInfo());
                    toast({ title: ok ? 'Data protected' : 'The browser said no', body: ok ? undefined : 'Installing the app usually allows it. Your data still stays on this device.', level: ok ? 'nominal' : 'monitor' });
                  }}
                >
                  Keep my data safe
                </button>
              )}
              {store?.usedMb != null && <span className="block text-xs">Using {store.usedMb} MB{store.quotaMb ? ` of ${Math.round(store.quotaMb / 1024)} GB available` : ''}.</span>}
            </Row>
            <Row ok={online} title={online ? 'Online' : 'Offline right now'}>
              {online ? (cloudEnabled && cloud.userId ? 'Your devices sync automatically through your account.' : 'No account in use: data stays on this device unless you send it.') : (
                <span className="inline-flex items-center gap-1">
                  <WifiOff className="h-4 w-4" aria-hidden /> Everything keeps working. Changes upload when you are back online.
                </span>
              )}
            </Row>
            <Row ok={!!battery && (battery.charging || battery.level > 0.2)} title={battery ? `Battery ${Math.round(battery.level * 100)}%${battery.charging ? ' (charging)' : ''}` : 'Battery level not shown by this browser'}>
              <span className="inline-flex items-center gap-1">
                <BatteryIcon className="h-4 w-4" aria-hidden /> {battery ? 'You will get a warning at 20% so you can hand off to another device.' : 'Chrome and Edge show it; Safari and Firefox do not.'}
              </span>
            </Row>
          </ul>
        </Panel>

        <Panel className="panel-pad">
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold">
            <Smartphone className="h-5 w-5 text-accent" aria-hidden /> Install as an app
          </h2>
          {installed ? (
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-nominal" aria-hidden /> You are using the installed app.
            </p>
          ) : installable ? (
            <>
              <p className="muted mb-3 text-sm">Adds VITALIS to your home screen or desktop. It opens in its own window and starts with no internet.</p>
              <button className="btn-primary" onClick={() => void promptInstall()}>
                <Download className="h-4 w-4" aria-hidden /> Install VITALIS
              </button>
            </>
          ) : (
            <ul className="muted list-disc space-y-1 pl-5 text-sm">
              {ios ? <li>iPhone / iPad (Safari): tap the Share button, then <b>Add to Home Screen</b>.</li> : <li>Android (Chrome): menu ⋮ → <b>Install app</b> or <b>Add to Home screen</b>.</li>}
              <li>Windows / Mac (Chrome or Edge): click the install icon at the right end of the address bar.</li>
              <li>After installing, open it once while online so every page is saved for offline use.</li>
            </ul>
          )}
        </Panel>

        <Panel className="panel-pad lg:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
            <Laptop className="h-5 w-5 text-accent" aria-hidden /> Move your data to another device (no internet needed)
          </h2>
          <p className="muted mb-4 text-sm">
            Battery running out, or switching from phone to laptop? Send a hand-off file and open it on the other device. Nothing is deleted: both devices end up with everything. It is safe to do it again; duplicates are skipped.
          </p>
          <ol className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
            <li className="rounded-xl bg-white/5 p-3">
              <b>1. On this device</b> tap <i>Send</i>. On a phone pick Nearby Share, AirDrop, Bluetooth or Files.
            </li>
            <li className="rounded-xl bg-white/5 p-3">
              <b>2. No sharing?</b> The file is saved to Downloads: copy it with a USB cable or memory card.
            </li>
            <li className="rounded-xl bg-white/5 p-3">
              <b>3. On the other device</b> open VITALIS → Devices & sync → <i>Receive</i> and pick the file.
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => void send()} disabled={busy || !mission}>
              <Send className="h-4 w-4" aria-hidden /> Send to my other device
            </button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4" aria-hidden /> Receive from my other device
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose a hand-off file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void pick(f);
            }}
          />
          <p className="muted mt-3 text-xs">The file contains your health records and private journal, so only send it to your own devices. Passcode and settings are not included.</p>

          {incoming && (
            <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 p-4" role="dialog" aria-label="Confirm sync">
              <p className="font-semibold">
                From {incoming.bundle.deviceName}, saved {new Date(incoming.bundle.exportedAt).toLocaleString()}
              </p>
              <p className="mt-1 text-sm">
                {incoming.preview.total ? `This will add ${describeAdded(incoming.preview.added)}${incoming.preview.updated ? ` and update ${incoming.preview.updated}` : ''}.` : 'This device already has everything in this file.'}
                {incoming.preview.adoptsMission && ` It also sets up the mission "${incoming.bundle.mission?.name}" on this device.`}
              </p>
              {incoming.preview.otherMission && (
                <p className="mt-2 text-sm text-act">
                  Careful: this file is from a different mission ("{incoming.preview.otherMission}"). Its crew and records will be added next to yours.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button className="btn-primary" onClick={() => void merge()} disabled={busy || !incoming.preview.total}>
                  Sync now
                </button>
                <button className="btn-ghost" onClick={() => setIncoming(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Panel>

        <Panel className="panel-pad">
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold">
            <Watch className="h-5 w-5 text-accent" aria-hidden /> Connect your watch
          </h2>
          <p className="muted mb-3 text-sm">VITALIS reads heart rate straight from your watch over Bluetooth. No internet, no extra app.</p>
          <ul className="muted mb-3 list-disc space-y-1 pl-5 text-sm">
            <li><b>Garmin</b>: on the watch turn on <i>Broadcast Heart Rate</i>.</li>
            <li><b>Polar, Coros, Suunto, Wahoo, Amazfit</b> and most chest straps and fitness bands: start a workout or turn on <i>HR broadcast</i>.</li>
            <li><b>Apple Watch / most Wear OS watches</b> do not share heart rate directly; use a chest strap, or the phone camera instead.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={!bluetoothSupported() || busy}
              onClick={async () => {
                try {
                  await connectBluetooth('heart_rate');
                  navigate('live');
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'Connection failed';
                  if (!/cancel|chooser|User/i.test(msg)) toast({ title: 'Could not connect', body: msg, level: 'act' });
                }
              }}
            >
              <Bluetooth className="h-4 w-4" aria-hidden /> Connect watch
            </button>
            <button className="btn-ghost" onClick={() => navigate('live')}>
              <Radio className="h-4 w-4" aria-hidden /> All sensors
            </button>
          </div>
          {!bluetoothSupported() && <p className="muted mt-2 text-xs">Bluetooth needs Chrome or Edge on Android, Windows, macOS or ChromeOS (not iPhone Safari).</p>}
        </Panel>

        <Panel className="panel-pad">
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold">
            <Camera className="h-5 w-5 text-accent" aria-hidden /> Use your phone as a sensor
          </h2>
          <p className="muted mb-3 text-sm">No watch? Hold a fingertip over the phone camera to measure heart rate, or scan a printed health report.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => navigate('camera')}>
              <Camera className="h-4 w-4" aria-hidden /> Camera heart rate
            </button>
            <button className="btn-ghost" onClick={() => navigate('checkin')}>
              Scan a report
            </button>
          </div>
          <h3 className="mt-5 flex items-center gap-2 font-semibold">
            <Cloud className="h-4 w-4 text-accent" aria-hidden /> Sync with internet
          </h3>
          <p className="muted text-sm">
            {cloudEnabled
              ? cloud.userId
                ? `Signed in: every device you sign in on syncs automatically${cloud.pending ? ` (${cloud.pending} change${cloud.pending === 1 ? '' : 's'} waiting to upload)` : ''}.`
                : 'Sign in on each device (Settings → Account) and they stay in sync automatically when online.'
              : 'This copy of VITALIS has no account server set up, so use hand-off files above.'}
          </p>
        </Panel>
      </div>
    </>
  );
}
