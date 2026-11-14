/**
 * Device hub: connects sensor sources (Bluetooth, USB serial, Wi-Fi/WebSocket,
 * simulator), keeps the latest value + 10-minute history per channel, raises
 * debounced live alarms, and emits one-minute aggregates for storage/sync.
 */
import { create } from 'zustand';
import type { ChannelId, ChannelValues, StatusLevel } from '@/types';
import { emit } from '@/utils/bus';
import { alertSound, stopAlertSound } from '@/utils/sound';
import { uid } from '@/utils';
import { CHANNELS, CHANNEL_IDS, rmssd } from './channels';
import { BLE_PROFILES, parseBloodPressure, parseHeartRate, parsePlx, parseTemperature, parseWeight, type BleProfile } from './gatt';
import { parseFrame, splitLines } from './protocol';
import { aggregate, debounce, liveLevel } from './logic';
import { SuitSimulator, type Fault } from './simulator';

export type SourceKind = 'bluetooth' | 'serial' | 'websocket' | 'simulator';

export interface Source {
  id: string;
  kind: SourceKind;
  name: string;
  status: 'connecting' | 'live' | 'error' | 'closed';
  error?: string;
  lastFrameAt?: number;
  channels: ChannelId[];
}

export interface Reading {
  v: number;
  t: number;
  source: string;
}

export interface AlarmState {
  level: StatusLevel;
  since: number;
  alarm: boolean;
}

interface DeviceState {
  sources: Source[];
  latest: Partial<Record<ChannelId, Reading>>;
  history: Partial<Record<ChannelId, { t: number; v: number }[]>>;
  alarms: Partial<Record<ChannelId, AlarmState>>;
  eva: boolean;
  faults: Fault[];
  muted: boolean;

  ingest: (sourceId: string, values: ChannelValues) => void;
  connectBluetooth: (profile: BleProfile) => Promise<void>;
  connectSerial: () => Promise<void>;
  connectWebSocket: (url: string) => void;
  startSimulator: (eva: boolean) => void;
  injectFault: (f: Fault) => void;
  clearFaults: () => void;
  disconnect: (id: string) => void;
  disconnectAll: () => void;
  setMuted: (m: boolean) => void;
}

const HISTORY_MS = 10 * 60 * 1000;
const handles = new Map<string, () => void>();
const rrBuffer: number[] = [];
let minuteFrames: { t: number; v: ChannelValues }[] = [];
let minuteTimer: ReturnType<typeof setInterval> | null = null;
let lastBroadcast = 0;
/** Danger alarms that stay active beep again every 20 s until fixed or muted. */
const REPEAT_MS = 20_000;
let lastRepeat = 0;
let sim: SuitSimulator | null = null;

export const bluetoothSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;
export const serialSupported = () => typeof navigator !== 'undefined' && !!navigator.serial;

function ensureMinuteTimer() {
  if (minuteTimer) return;
  minuteTimer = setInterval(() => {
    const frames = minuteFrames;
    minuteFrames = [];
    if (!frames.length) return;
    const names = useDevices.getState().sources.filter((s) => s.status === 'live').map((s) => s.name);
    emit('vitalSample', { ts: new Date().toISOString(), channels: aggregate(frames), sources: names });
  }, 60_000);
}

function stopMinuteTimerIfIdle() {
  if (useDevices.getState().sources.some((s) => s.status === 'live' || s.status === 'connecting')) return;
  if (minuteTimer) clearInterval(minuteTimer);
  minuteTimer = null;
}

function beep(level: StatusLevel) {
  if (useDevices.getState().muted) return;
  alertSound(level === 'critical' ? 'critical' : 'act');
}

export const useDevices = create<DeviceState>((set, get) => {
  const addSource = (kind: SourceKind, name: string): string => {
    const id = uid('src-');
    set({ sources: [...get().sources, { id, kind, name, status: 'connecting', channels: [] }] });
    ensureMinuteTimer();
    return id;
  };
  const patch = (id: string, p: Partial<Source>) => set({ sources: get().sources.map((s) => (s.id === id ? { ...s, ...p } : s)) });

  return {
    sources: [],
    latest: {},
    history: {},
    alarms: {},
    eva: false,
    faults: [],
    muted: false,

    ingest: (sourceId, values) => {
      const now = Date.now();
      const src = get().sources.find((s) => s.id === sourceId);
      if (!src) return;
      const latest = { ...get().latest };
      const history = { ...get().history };
      const alarms = { ...get().alarms };
      for (const id of Object.keys(values) as ChannelId[]) {
        const v = values[id]!;
        latest[id] = { v, t: now, source: src.name };
        const h = (history[id] ?? []).filter((p) => now - p.t < HISTORY_MS);
        if (!h.length || now - h[h.length - 1].t >= 1000) h.push({ t: now, v });
        history[id] = h;
        const prev = alarms[id];
        const next = debounce(prev, liveLevel(id, v), now);
        alarms[id] = next;
        if (next.alarm && !prev?.alarm) {
          emit('liveAlarm', { channel: id, level: next.level, value: v, at: now });
          beep(next.level);
        }
      }
      if (now - lastRepeat >= REPEAT_MS) {
        const urgent = Object.values(alarms).some((a) => a?.alarm && a.level === 'critical');
        if (urgent) {
          if (lastRepeat) beep('critical');
          lastRepeat = now;
        } else lastRepeat = 0;
      }
      const channels = [...new Set([...src.channels, ...(Object.keys(values) as ChannelId[])])];
      set({ latest, history, alarms, sources: get().sources.map((s) => (s.id === sourceId ? { ...s, status: 'live', lastFrameAt: now, channels } : s)) });
      minuteFrames.push({ t: now, v: values });
      if (now - lastBroadcast > 2000) {
        lastBroadcast = now;
        const snapshot: ChannelValues = {};
        for (const id of CHANNEL_IDS) if (latest[id] && now - latest[id]!.t < 15_000) snapshot[id] = latest[id]!.v;
        emit('liveFrame', { values: snapshot, at: now, eva: get().eva });
      }
    },

    connectBluetooth: async (profile) => {
      if (!navigator.bluetooth) throw new Error('Web Bluetooth is not available in this browser. Use Chrome or Edge on desktop/Android.');
      const meta = BLE_PROFILES[profile];
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [meta.service] }] });
      const id = addSource('bluetooth', device.name || meta.label);
      try {
        const server = await device.gatt!.connect();
        const svc = await server.getPrimaryService(meta.service);
        const ch = await svc.getCharacteristic(meta.characteristic);
        const onValue = (e: Event) => {
          const dv = (e.target as BluetoothRemoteGATTCharacteristic).value;
          if (!dv) return;
          const vals: ChannelValues = {};
          if (profile === 'heart_rate') {
            const r = parseHeartRate(dv);
            vals.hr = r.hr;
            if (r.rr.length) {
              rrBuffer.push(...r.rr);
              rrBuffer.splice(0, Math.max(0, rrBuffer.length - 60));
              const h = rmssd(rrBuffer.slice(-30));
              if (h !== null) vals.hrv = Math.round(h);
            }
          } else if (profile === 'pulse_oximeter') {
            const r = parsePlx(dv);
            if (Number.isFinite(r.spo2)) vals.spo2 = r.spo2;
            if (Number.isFinite(r.pr)) vals.hr = r.pr;
          } else if (profile === 'blood_pressure') {
            const r = parseBloodPressure(dv);
            vals.sys = Math.round(r.sys);
            vals.dia = Math.round(r.dia);
            if (r.pulse && Number.isFinite(r.pulse)) vals.hr = r.pulse;
          } else if (profile === 'health_thermometer') {
            vals.temp = Number(parseTemperature(dv).toFixed(1));
          } else if (profile === 'weight_scale') {
            vals.mass = Number(parseWeight(dv).toFixed(1));
          }
          const clean = parseFrame(vals);
          if (clean) get().ingest(id, clean);
        };
        ch.addEventListener('characteristicvaluechanged', onValue);
        await ch.startNotifications();
        patch(id, { status: 'live' });
        const onDisc = () => patch(id, { status: 'closed', error: 'Device disconnected' });
        device.addEventListener('gattserverdisconnected', onDisc);
        handles.set(id, () => {
          ch.removeEventListener('characteristicvaluechanged', onValue);
          device.removeEventListener('gattserverdisconnected', onDisc);
          if (device.gatt?.connected) device.gatt.disconnect();
        });
      } catch (err) {
        patch(id, { status: 'error', error: err instanceof Error ? err.message : 'Connection failed' });
      }
    },

    connectSerial: async () => {
      if (!navigator.serial) throw new Error('Web Serial is not available in this browser. Use Chrome or Edge on desktop.');
      const port = await navigator.serial.requestPort();
      const id = addSource('serial', 'USB suit / sensor board');
      let stop = false;
      handles.set(id, () => {
        stop = true;
      });
      try {
        await port.open({ baudRate: 115200 });
        patch(id, { status: 'live' });
        const reader = port.readable!.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).getReader();
        handles.set(id, () => {
          stop = true;
          void reader.cancel().then(() => port.close()).catch(() => undefined);
        });
        let buf = '';
        while (!stop) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const { lines, rest } = splitLines(buf);
          buf = rest.slice(-4096);
          for (const l of lines) {
            const f = parseFrame(l);
            if (f) get().ingest(id, f);
          }
        }
        patch(id, { status: 'closed' });
      } catch (err) {
        patch(id, { status: 'error', error: err instanceof Error ? err.message : 'Serial error' });
      }
    },

    connectWebSocket: (url) => {
      const id = addSource('websocket', `Wi-Fi bridge (${url.replace(/^wss?:\/\//, '')})`);
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        patch(id, { status: 'error', error: err instanceof Error ? err.message : 'Invalid URL' });
        return;
      }
      ws.onopen = () => patch(id, { status: 'live' });
      ws.onerror = () => patch(id, { status: 'error', error: 'Could not reach the bridge' });
      ws.onclose = () => {
        const s = get().sources.find((x) => x.id === id);
        if (s && s.status !== 'error') patch(id, { status: 'closed' });
      };
      ws.onmessage = (m) => {
        const text = typeof m.data === 'string' ? m.data : '';
        for (const l of text.split(/\r?\n/)) {
          const f = parseFrame(l);
          if (f) get().ingest(id, f);
        }
      };
      handles.set(id, () => ws.close());
    },

    startSimulator: (eva) => {
      get().sources.filter((s) => s.kind === 'simulator').forEach((s) => get().disconnect(s.id));
      sim = new SuitSimulator(Date.now(), eva);
      const id = addSource('simulator', eva ? 'Suit simulator (EVA)' : 'Wearable simulator (cabin)');
      set({ eva, faults: [] });
      const t = setInterval(() => get().ingest(id, sim!.step(1)), 1000);
      handles.set(id, () => {
        clearInterval(t);
        sim = null;
        set({ eva: false, faults: [] });
      });
      get().ingest(id, sim.step(1));
    },

    injectFault: (f) => {
      sim?.inject(f);
      set({ faults: sim?.activeFaults() ?? [] });
    },
    clearFaults: () => {
      sim?.clear();
      set({ faults: [] });
    },

    disconnect: (id) => {
      handles.get(id)?.();
      handles.delete(id);
      set({ sources: get().sources.filter((s) => s.id !== id) });
      stopMinuteTimerIfIdle();
    },
    disconnectAll: () => get().sources.forEach((s) => get().disconnect(s.id)),
    setMuted: (muted) => {
      if (muted) stopAlertSound();
      set({ muted });
    },
  };
});

/** Latest reading per channel that is fresh enough to use (default 30 min). */
export function freshReadings(maxAgeMs = 30 * 60 * 1000): Partial<Record<ChannelId, Reading>> {
  const now = Date.now();
  const out: Partial<Record<ChannelId, Reading>> = {};
  const latest = useDevices.getState().latest;
  for (const id of CHANNEL_IDS) if (latest[id] && now - latest[id]!.t <= maxAgeMs) out[id] = latest[id];
  return out;
}

export { CHANNELS };
