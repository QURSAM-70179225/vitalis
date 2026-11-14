import { useState } from 'react';
import { Bluetooth, Cable, ClipboardCheck, Cpu, FlaskConical, Info, Radio, ShieldAlert, Unplug, Volume2, VolumeX, Wifi, Zap } from 'lucide-react';
import type { ChannelId } from '@/types';
import { useApp } from '@/store/useApp';
import { navigate } from '@/hooks/useRoute';
import { useDevices, bluetoothSupported, serialSupported } from '@/devices/hub';
import { BODY_CHANNELS, CHANNELS, SUIT_CHANNELS } from '@/devices/channels';
import { BLE_PROFILES, type BleProfile } from '@/devices/gatt';
import { FAULTS, type Fault } from '@/devices/simulator';
import { liveLevel } from '@/devices/logic';
import { LIVE_ACTIONS } from '@/devices/useDeviceEffects';
import { LEVEL_META, rank } from '@/engine/status';
import { cn, timeAgo } from '@/utils';
import { PageHeader, Panel, Sparkline, StatusBadge } from '@/components/ui';

function Tile({ id }: { id: ChannelId }) {
  const r = useDevices((s) => s.latest[id]);
  const hist = useDevices((s) => s.history[id]);
  const alarm = useDevices((s) => s.alarms[id]);
  const meta = CHANNELS[id];
  const stale = !r || Date.now() - r.t > 15_000;
  const lvl = r ? liveLevel(id, r.v) : 'nominal';
  const m = LEVEL_META[lvl];
  return (
    <div className={cn('panel p-4 transition', alarm?.alarm && 'border-2 ' + m.border, stale && 'opacity-50')} aria-live={alarm?.alarm ? 'assertive' : undefined}>
      <div className="flex items-center justify-between">
        <span className="eyebrow">{meta.short}</span>
        {r && !stale ? <StatusBadge level={lvl} size="sm" short /> : <span className="muted text-[11px]">{r ? 'stale' : 'no signal'}</span>}
      </div>
      <p className="numeral mt-1 text-4xl" style={{ color: r && !stale ? m.color : undefined }}>
        {r ? r.v.toFixed(meta.digits) : '--'}
        <span className="muted ml-1 text-sm font-normal">{meta.unit}</span>
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="muted truncate text-[11px]">{r ? `${r.source} · ${timeAgo(new Date(r.t).toISOString())}` : meta.label}</span>
        <Sparkline values={(hist ?? []).slice(-300).map((p) => p.v)} color={m.color} width={90} height={26} label={`${meta.label}, last 5 minutes`} />
      </div>
    </div>
  );
}

export default function Live() {
  const sources = useDevices((s) => s.sources);
  const alarms = useDevices((s) => s.alarms);
  const latest = useDevices((s) => s.latest);
  const eva = useDevices((s) => s.eva);
  const faults = useDevices((s) => s.faults);
  const muted = useDevices((s) => s.muted);
  const dev = useDevices.getState();
  const toast = useApp((s) => s.toast);
  const setCalm = useApp((s) => s.setCalm);
  const [wsUrl, setWsUrl] = useState('ws://192.168.4.1:81');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      if (!/cancel|chooser|No port selected|User/i.test(msg)) toast({ title: 'Could not connect', body: msg, level: 'act' });
    } finally {
      setBusy(false);
    }
  };

  const active = (Object.entries(alarms) as [ChannelId, { level: 'nominal' | 'monitor' | 'act' | 'critical'; alarm: boolean }][])
    .filter(([, a]) => a.alarm)
    .sort((a, b) => rank(b[1].level) - rank(a[1].level));
  const hasSuit = SUIT_CHANNELS.some((c) => latest[c]);
  const live = sources.some((s) => s.status === 'live');

  return (
    <>
      <PageHeader
        eyebrow="Continuous monitoring"
        title="Live monitor"
        subtitle="Readings stream automatically from your suit, wearables and medical devices. Alarms fire within seconds, and one-minute averages are saved and synced to the ground team."
        actions={
          <>
            <button className="btn-ghost" data-silence-alerts onClick={() => dev.setMuted(!muted)} aria-pressed={muted}>
              {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />} {muted ? 'Alarm sound off' : 'Alarm sound on'}
            </button>
            <button className="btn-primary" onClick={() => navigate('checkin')} disabled={!live}>
              <ClipboardCheck className="h-4 w-4" aria-hidden /> Check-in with these readings
            </button>
          </>
        }
      />

      {active.length > 0 && (
        <div role="alert" className={cn('panel mb-5 flex flex-wrap items-center gap-3 border-2 p-4', LEVEL_META[active[0][1].level].border, LEVEL_META[active[0][1].level].bg)}>
          <ShieldAlert className="h-7 w-7 shrink-0" style={{ color: LEVEL_META[active[0][1].level].color }} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold">
              {active.map(([c]) => `${CHANNELS[c].label} ${latest[c]?.v.toFixed(CHANNELS[c].digits)} ${CHANNELS[c].unit}`).join(' · ')}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Do now: </span>
              {(LIVE_ACTIONS[active[0][0]] ?? ['Verify the sensor and recheck']).join(' · ')}
            </p>
            <p className="muted text-xs">The ground team is notified automatically when your link is up.</p>
          </div>
          {active[0][1].level === 'critical' && (
            <button className="btn-danger" onClick={() => setCalm(true)}>
              Calm mode checklist
            </button>
          )}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section aria-labelledby="body-h">
            <h2 id="body-h" className="h2 mb-3">
              Body
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {BODY_CHANNELS.map((c) => (
                <Tile key={c} id={c} />
              ))}
            </div>
          </section>
          {(eva || hasSuit) && (
            <section aria-labelledby="suit-h">
              <h2 id="suit-h" className="h2 mb-3 flex items-center gap-2">
                Space suit <span className="chip border-accent text-accent">EVA</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {SUIT_CHANNELS.map((c) => (
                  <Tile key={c} id={c} />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-5">
          <Panel aria-labelledby="src-h">
            <h2 id="src-h" className="h2 mb-3 flex items-center gap-2">
              <Radio className="h-5 w-5 text-accent" aria-hidden /> Connected sources
            </h2>
            {sources.length ? (
              <ul className="space-y-2">
                {sources.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 rounded-xl bg-white/5 p-2 text-sm">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', s.status === 'live' ? 'bg-nominal' : s.status === 'connecting' ? 'bg-monitor' : 'bg-critical')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="muted block text-xs">{s.status === 'error' || s.status === 'closed' ? s.error ?? s.status : `${s.status} · ${s.channels.map((c) => CHANNELS[c].short).join(', ') || 'waiting for data'}`}</span>
                    </span>
                    <button className="btn-icon btn-ghost h-9 w-9" aria-label={`Disconnect ${s.name}`} onClick={() => dev.disconnect(s.id)}>
                      <Unplug className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted text-sm">No devices connected. Add one below.</p>
            )}
          </Panel>

          <Panel aria-labelledby="ble-h">
            <h2 id="ble-h" className="h2 mb-1 flex items-center gap-2">
              <Bluetooth className="h-5 w-5 text-accent" aria-hidden /> Bluetooth medical devices
            </h2>
            <p className="muted mb-3 text-xs">Any device using the standard Bluetooth health profiles. {!bluetoothSupported() && 'Not available in this browser: use Chrome or Edge on Windows, macOS, Android or ChromeOS.'}</p>
            <div className="grid gap-2">
              {(Object.keys(BLE_PROFILES) as BleProfile[]).map((p) => (
                <button key={p} className="btn-ghost justify-start text-left" disabled={!bluetoothSupported() || busy} onClick={() => run(() => dev.connectBluetooth(p))} title={BLE_PROFILES[p].examples}>
                  <span className="min-w-0">
                    <span className="block">{BLE_PROFILES[p].label}</span>
                    <span className="muted block truncate text-[11px] font-normal">{BLE_PROFILES[p].examples}</span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel aria-labelledby="suit-src-h">
            <h2 id="suit-src-h" className="h2 mb-1 flex items-center gap-2">
              <Cpu className="h-5 w-5 text-accent" aria-hidden /> Suit / wearable telemetry
            </h2>
            <p className="muted mb-3 text-xs">Suit computers and sensor boards (e.g. ESP32) stream the VITALIS JSON-lines protocol over USB or Wi-Fi. See docs/SENSORS.md.</p>
            <button className="btn-ghost mb-2 w-full" disabled={!serialSupported() || busy} onClick={() => run(() => dev.connectSerial())}>
              <Cable className="h-4 w-4" aria-hidden /> Connect over USB
            </button>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                dev.connectWebSocket(wsUrl);
              }}
            >
              <label htmlFor="ws" className="sr-only">
                Wi-Fi bridge address
              </label>
              <input id="ws" className="field h-11 py-0 text-sm" value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} />
              <button className="btn-ghost shrink-0">
                <Wifi className="h-4 w-4" aria-hidden /> Connect
              </button>
            </form>
          </Panel>

          <Panel aria-labelledby="sim-h">
            <h2 id="sim-h" className="h2 mb-1 flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-monitor" aria-hidden /> Simulator
            </h2>
            <p className="muted mb-3 text-xs">Test without hardware. Inject faults to rehearse emergencies; the ground console sees them too.</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={() => dev.startSimulator(true)}>
                Suit (EVA)
              </button>
              <button className="btn-ghost" onClick={() => dev.startSimulator(false)}>
                Cabin wearable
              </button>
            </div>
            {sources.some((s) => s.kind === 'simulator') && (
              <div className="mt-3">
                <p className="label">Inject fault</p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(FAULTS) as Fault[]).map((f) => (
                    <button key={f} className={cn('chip focus-ring min-h-[36px]', faults.includes(f) && 'border-critical text-critical')} onClick={() => dev.injectFault(f)} aria-pressed={faults.includes(f)}>
                      <Zap className="h-3 w-3" aria-hidden /> {FAULTS[f]}
                    </button>
                  ))}
                  {faults.length > 0 && (
                    <button className="chip focus-ring min-h-[36px]" onClick={() => dev.clearFaults()}>
                      Clear faults
                    </button>
                  )}
                </div>
              </div>
            )}
          </Panel>

          <p className="muted flex gap-2 text-xs">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            Flight suits (e.g. xEMU, AxEMU) send telemetry over their own certified systems. A suit integration would add a small bridge that forwards that data in the VITALIS protocol.
          </p>
        </div>
      </div>
    </>
  );
}
