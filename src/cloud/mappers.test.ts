import { describe, expect, it } from 'vitest';
import { fromRow, missionFromRow, profileToCrew, toRow } from './mappers';
import type { CheckIn, GroundMessage, SharedAlert, VitalSample } from '@/types';

const M = '11111111-1111-1111-1111-111111111111';

describe('cloud mappers round-trip', () => {
  it('check-ins', () => {
    const c: CheckIn = { id: 'ci1', crewId: 'u1', day: 3, timestamp: '2026-11-07T07:00:00.000Z', values: { heartRate: 61, systolic: 118 }, symptoms: ['headache'], notes: 'ok', source: 'device' };
    const row = toRow('check_ins', c as unknown as Record<string, unknown>, M);
    expect(row).toMatchObject({ crew_id: 'u1', mission_id: M, vals: { heartRate: 61, systolic: 118 }, ts: c.timestamp });
    expect(fromRow.check_ins(row)).toEqual(c);
  });
  it('vital samples', () => {
    const v: VitalSample = { id: 'vs1', crewId: 'u1', ts: '2026-11-07T07:01:00.000Z', channels: { hr: 70, suitPressure: 29.5 }, sources: ['Polar H10'] };
    expect(fromRow.vital_samples(toRow('vital_samples', v as unknown as Record<string, unknown>, M))).toEqual(v);
  });
  it('alerts never upload acknowledgement fields', () => {
    const a: SharedAlert = { id: 'a1', crewId: 'u1', day: 4, level: 'critical', ruleId: 'live-spo2', title: 'LIVE: SpO2 86', why: ['x'], actions: ['y'], source: 'live', createdAt: '2026-11-07T07:00:00Z', acknowledgedAt: '2026-11-07T07:05:00Z' };
    const row = toRow('alerts', a as unknown as Record<string, unknown>, M);
    expect(row).not.toHaveProperty('acknowledged_at');
    expect(fromRow.alerts({ ...row, acknowledged_at: null }).source).toBe('live');
  });
  it('messages', () => {
    const m: GroundMessage = { id: 'm1', crewId: 'u1', authorId: 'g1', authorName: 'CAPCOM', body: 'Copy', createdAt: '2026-11-07T07:00:00Z' };
    expect(fromRow.ground_messages(toRow('ground_messages', m as unknown as Record<string, unknown>, M))).toEqual(m);
  });
  it('profiles and missions', () => {
    const crew = profileToCrew({ id: 'u1', name: 'Lena', callsign: 'ORION', color: '#fff', role: 'cmo', mission_id: M });
    expect(crew).toMatchObject({ role: 'Crew Medical Officer', missionRole: 'cmo' });
    const mission = missionFromRow({ id: M, name: 'ARES', environment_id: 'mars-transit', start_date: '2026-08-01T00:00:00Z', created_by: 'u1' }, 'u1', 'x');
    expect(mission).toMatchObject({ id: 'mission', cloudId: M, demo: false, environmentId: 'mars-transit' });
  });
});
