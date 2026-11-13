/** Tiny typed event bus that decouples sensors, the store and cloud sync. */
import type { ChannelId, ChannelValues, StatusLevel, SyncTable } from '@/types';

export interface BusEvents {
  /** A local write that should be mirrored to the cloud. */
  write: { table: SyncTable; row: Record<string, unknown>; id: string };
  /** One-minute sensor aggregate (crew id is filled in by the listener). */
  vitalSample: { ts: string; channels: ChannelValues; sources: string[] };
  /** A debounced live alarm started. */
  liveAlarm: { channel: ChannelId; level: StatusLevel; value: number; at: number };
  /** Throttled live frame (for streaming to the ground console). */
  liveFrame: { values: ChannelValues; at: number; eva: boolean };
}

type Handler<K extends keyof BusEvents> = (e: BusEvents[K]) => void;
type AnyHandler = (e: unknown) => void;
const handlers = new Map<keyof BusEvents, Set<AnyHandler>>();

export function on<K extends keyof BusEvents>(k: K, h: Handler<K>): () => void {
  let set = handlers.get(k);
  if (!set) handlers.set(k, (set = new Set()));
  const fn = h as AnyHandler;
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

export function emit<K extends keyof BusEvents>(k: K, e: BusEvents[K]): void {
  handlers.get(k)?.forEach((h) => {
    try {
      h(e);
    } catch (err) {
      console.error('bus handler failed', k, err);
    }
  });
}
