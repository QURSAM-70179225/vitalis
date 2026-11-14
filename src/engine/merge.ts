/**
 * Offline merge for device hand-off files. Pure: no storage, no React.
 *
 * Health records are append-only (a check-in never changes once saved), so the
 * merge is a union by id. A few records do move forward over time (a packet gets
 * delivered, a message gets read, an alert gets acknowledged): for those the
 * more advanced copy wins, so merging in either direction gives the same result.
 */
import type { GroundMessage, GroundPacket, SharedAlert, SyncBundle, SyncTables } from '@/types';

export const SYNC_TABLES: (keyof SyncTables)[] = ['crew', 'checkIns', 'cognitive', 'journal', 'events', 'attachments', 'packets', 'vitals', 'messages', 'alerts'];

const PACKET_RANK: Record<GroundPacket['status'], number> = { queued: 0, transmitting: 1, delivered: 2, replied: 3 };

/** Positive when `b` is further along than `a`. */
function progress(table: keyof SyncTables, a: unknown, b: unknown): number {
  if (table === 'packets') return PACKET_RANK[(b as GroundPacket).status] - PACKET_RANK[(a as GroundPacket).status];
  if (table === 'messages') return Number(!!(b as GroundMessage).readAt) - Number(!!(a as GroundMessage).readAt);
  if (table === 'alerts') return Number(!!(b as SharedAlert).acknowledgedAt) - Number(!!(a as SharedAlert).acknowledgedAt);
  return 0;
}

export interface MergeResult {
  /** Rows to write on this device (new ones and ones that moved forward). */
  writes: SyncTables;
  /** New rows per table. */
  added: Record<keyof SyncTables, number>;
  /** Existing rows that were updated (e.g. a message read on the other device). */
  updated: number;
  /** Total rows written. */
  total: number;
}

export function emptyTables(): SyncTables {
  return { crew: [], checkIns: [], cognitive: [], journal: [], events: [], attachments: [], packets: [], vitals: [], messages: [], alerts: [] };
}

export function mergeTables(local: SyncTables, incoming: SyncTables): MergeResult {
  const writes = emptyTables();
  const added = Object.fromEntries(SYNC_TABLES.map((t) => [t, 0])) as Record<keyof SyncTables, number>;
  let updated = 0;
  for (const t of SYNC_TABLES) {
    const have = new Map<string, { id: string }>((local[t] as { id: string }[]).map((r) => [r.id, r]));
    const out = writes[t] as { id: string }[];
    for (const row of (incoming[t] ?? []) as { id: string }[]) {
      if (!row || typeof row.id !== 'string') continue;
      const mine = have.get(row.id);
      if (!mine) {
        out.push(row);
        added[t]++;
      } else if (progress(t, mine, row) > 0) {
        out.push(row);
        updated++;
      }
    }
  }
  const total = SYNC_TABLES.reduce((n, t) => n + writes[t].length, 0);
  return { writes, added, updated, total };
}

export function isSyncBundle(x: unknown): x is SyncBundle {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return o.app === 'vitalis' && o.kind === 'sync' && SYNC_TABLES.every((t) => Array.isArray(o[t]));
}

/** One short sentence, e.g. "12 check-ins, 3 reaction tests and 2 messages". */
export function describeAdded(added: Record<keyof SyncTables, number>): string {
  const names: Record<keyof SyncTables, [string, string]> = {
    crew: ['crew member', 'crew members'],
    checkIns: ['check-in', 'check-ins'],
    cognitive: ['reaction test', 'reaction tests'],
    journal: ['journal entry', 'journal entries'],
    events: ['mission event', 'mission events'],
    attachments: ['photo', 'photos'],
    packets: ['ground report', 'ground reports'],
    vitals: ['sensor reading', 'sensor readings'],
    messages: ['message', 'messages'],
    alerts: ['alert', 'alerts'],
  };
  const parts = SYNC_TABLES.filter((t) => added[t] > 0).map((t) => `${added[t]} ${names[t][added[t] === 1 ? 0 : 1]}`);
  if (!parts.length) return 'nothing new';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
