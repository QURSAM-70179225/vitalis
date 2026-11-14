import { describe, expect, it } from 'vitest';
import type { CheckIn, GroundMessage, GroundPacket, SyncTables } from '@/types';
import { describeAdded, emptyTables, isSyncBundle, mergeTables } from './merge';

const ci = (id: string, day: number): CheckIn => ({ id, crewId: 'c1', day, timestamp: `2026-01-0${day}T08:00:00Z`, values: { heartRate: 60 }, symptoms: [], source: 'manual' });
const pkt = (id: string, status: GroundPacket['status']): GroundPacket => ({ id, crewId: 'c1', createdAt: '2026-01-01T00:00:00Z', day: 1, rawBytes: 1, compressedBytes: 1, delaySec: 1, status } as GroundPacket);
const msg = (id: string, readAt?: string): GroundMessage => ({ id, crewId: 'c1', createdAt: '2026-01-01T00:00:00Z', readAt } as GroundMessage);
const t = (p: Partial<SyncTables>): SyncTables => ({ ...emptyTables(), ...p });

describe('device hand-off merge', () => {
  it('adds records that only the other device has and keeps everything local', () => {
    const r = mergeTables(t({ checkIns: [ci('a', 1), ci('b', 2)] }), t({ checkIns: [ci('b', 2), ci('c', 3)] }));
    expect(r.writes.checkIns.map((x) => x.id)).toEqual(['c']);
    expect(r.added.checkIns).toBe(1);
    expect(r.total).toBe(1);
  });

  it('is safe to import the same file twice', () => {
    const local = t({ checkIns: [ci('a', 1)] });
    const first = mergeTables(local, t({ checkIns: [ci('x', 2)] }));
    const second = mergeTables(t({ checkIns: [ci('a', 1), ...first.writes.checkIns] }), t({ checkIns: [ci('x', 2)] }));
    expect(second.total).toBe(0);
    expect(describeAdded(second.added)).toBe('nothing new');
  });

  it('keeps the more advanced copy of packets and messages, in either direction', () => {
    const fwd = mergeTables(t({ packets: [pkt('p', 'queued')], messages: [msg('m')] }), t({ packets: [pkt('p', 'replied')], messages: [msg('m', '2026-01-02T00:00:00Z')] }));
    expect(fwd.writes.packets[0].status).toBe('replied');
    expect(fwd.writes.messages[0].readAt).toBeTruthy();
    expect(fwd.updated).toBe(2);
    const back = mergeTables(t({ packets: [pkt('p', 'replied')] }), t({ packets: [pkt('p', 'queued')] }));
    expect(back.total).toBe(0);
  });

  it('ignores malformed rows and recognises only hand-off files', () => {
    const bad = { ...emptyTables(), checkIns: [null, { nope: 1 }] } as unknown as SyncTables;
    expect(mergeTables(emptyTables(), bad).total).toBe(0);
    expect(isSyncBundle({ app: 'vitalis', kind: 'sync', version: 2, ...emptyTables() })).toBe(true);
    expect(isSyncBundle({ app: 'vitalis', checkIns: [], crew: [] })).toBe(false);
  });

  it('describes what was added in plain words', () => {
    const r = mergeTables(emptyTables(), t({ checkIns: [ci('a', 1), ci('b', 2)], messages: [msg('m')] }));
    expect(describeAdded(r.added)).toBe('2 check-ins and 1 message');
  });
});
