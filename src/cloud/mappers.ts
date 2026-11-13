/** Conversions between local records and Supabase rows (pure, unit-tested). */
import type {
  CheckIn,
  CognitiveResult,
  CrewMember,
  EnvironmentId,
  GroundMessage,
  GroundPacket,
  JournalEntry,
  Mission,
  MissionEvent,
  MissionEventType,
  Role,
  SharedAlert,
  StatusLevel,
  SymptomId,
  SyncTable,
  VitalSample,
} from '@/types';

type Row = Record<string, unknown>;

export interface ProfileRow {
  id: string;
  name: string;
  callsign: string;
  color: string;
  role: Role;
  mission_id: string | null;
}

export interface MissionRow {
  id: string;
  name: string;
  environment_id: EnvironmentId;
  start_date: string;
  created_by: string | null;
}

export const ROLE_TITLE: Record<Role, string> = { astronaut: 'Astronaut', cmo: 'Crew Medical Officer', ground: 'Mission Control' };

export function profileToCrew(p: ProfileRow): CrewMember {
  return { id: p.id, name: p.name, callsign: p.callsign, role: ROLE_TITLE[p.role], age: 0, color: p.color, missionRole: p.role };
}

export function missionFromRow(m: MissionRow, activeCrewId: string, lastSync: string): Mission {
  return { id: 'mission', name: m.name, environmentId: m.environment_id, startDate: m.start_date, activeCrewId, lastGroundSync: lastSync, demo: false, cloudId: m.id };
}

/** Local record → row for upload. `missionId` is the Supabase mission UUID. */
export function toRow(table: SyncTable, rec: Row, missionId: string): Row {
  switch (table) {
    case 'check_ins': {
      const c = rec as unknown as CheckIn;
      return { id: c.id, crew_id: c.crewId, mission_id: missionId, day: c.day, ts: c.timestamp, vals: c.values, symptoms: c.symptoms, notes: c.notes ?? null, source: c.source };
    }
    case 'cognitive_results': {
      const c = rec as unknown as CognitiveResult;
      return { id: c.id, crew_id: c.crewId, mission_id: missionId, day: c.day, ts: c.timestamp, mean_rt: c.meanRt, median_rt: c.medianRt, lapses: c.lapses, false_starts: c.falseStarts, trials: c.trials };
    }
    case 'journal_entries': {
      const j = rec as unknown as JournalEntry;
      return { id: j.id, crew_id: j.crewId, day: j.day, ts: j.timestamp, mood: j.mood, note: j.note, wellbeing: j.wellbeing, answers: j.answers, connected_home: j.connectedHome };
    }
    case 'vital_samples': {
      const v = rec as unknown as VitalSample;
      return { id: v.id, crew_id: v.crewId, mission_id: missionId, ts: v.ts, channels: v.channels, sources: v.sources };
    }
    case 'alerts': {
      const a = rec as unknown as SharedAlert;
      return { id: a.id, crew_id: a.crewId, mission_id: missionId, day: a.day, level: a.level, rule_id: a.ruleId, title: a.title, why: a.why, actions: a.actions, source: a.source, created_at: a.createdAt };
    }
    case 'packets': {
      const p = rec as unknown as GroundPacket;
      return { id: p.id, crew_id: p.crewId, mission_id: missionId, day: p.day, created_at: p.createdAt, overall: p.overall, summary: p.summary, top_rule: p.topRule ?? null, raw_bytes: p.rawBytes, compressed_bytes: p.compressedBytes, payload: p.payload ?? {} };
    }
    case 'ground_messages': {
      const m = rec as unknown as GroundMessage;
      return { id: m.id, mission_id: missionId, crew_id: m.crewId, author_id: m.authorId, author_name: m.authorName, body: m.body, packet_id: m.packetId ?? null, created_at: m.createdAt, read_at: m.readAt ?? null };
    }
    case 'mission_events': {
      const e = rec as unknown as MissionEvent;
      return { id: e.id, mission_id: missionId, day: e.day, type: e.type, label: e.label, crew_ids: e.crewIds };
    }
  }
}

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const arr = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
const obj = <T>(v: unknown) => (v && typeof v === 'object' ? (v as T) : ({} as T));

export const fromRow = {
  check_ins: (r: Row): CheckIn => ({ id: s(r.id), crewId: s(r.crew_id), day: n(r.day), timestamp: s(r.ts), values: obj(r.vals), symptoms: arr<SymptomId>(r.symptoms), notes: (r.notes as string | null) ?? undefined, source: (s(r.source) || 'manual') as CheckIn['source'] }),
  cognitive_results: (r: Row): CognitiveResult => ({ id: s(r.id), crewId: s(r.crew_id), day: n(r.day), timestamp: s(r.ts), meanRt: n(r.mean_rt), medianRt: n(r.median_rt), lapses: n(r.lapses), falseStarts: n(r.false_starts), trials: n(r.trials) }),
  journal_entries: (r: Row): JournalEntry => ({ id: s(r.id), crewId: s(r.crew_id), day: n(r.day), timestamp: s(r.ts), mood: n(r.mood), note: s(r.note), wellbeing: n(r.wellbeing), answers: arr<number>(r.answers), connectedHome: !!r.connected_home }),
  vital_samples: (r: Row): VitalSample => ({ id: s(r.id), crewId: s(r.crew_id), ts: s(r.ts), channels: obj(r.channels), sources: arr<string>(r.sources) }),
  alerts: (r: Row): SharedAlert => ({
    id: s(r.id),
    crewId: s(r.crew_id),
    day: n(r.day),
    level: s(r.level) as StatusLevel,
    ruleId: s(r.rule_id),
    title: s(r.title),
    why: arr<string>(r.why),
    actions: arr<string>(r.actions),
    source: r.source === 'live' ? 'live' : 'triage',
    createdAt: s(r.created_at),
    acknowledgedAt: (r.acknowledged_at as string | null) ?? undefined,
    acknowledgedBy: (r.acknowledged_by as string | null) ?? undefined,
  }),
  packets: (r: Row): GroundPacket => ({
    id: s(r.id),
    crewId: s(r.crew_id),
    createdAt: s(r.created_at),
    day: n(r.day),
    rawBytes: n(r.raw_bytes),
    compressedBytes: n(r.compressed_bytes),
    delaySec: 0,
    status: 'delivered',
    sentAt: s(r.created_at),
    deliveredAt: s(r.created_at),
    summary: s(r.summary),
    overall: s(r.overall) as StatusLevel,
    topRule: (r.top_rule as string | null) ?? undefined,
    payload: r.payload,
  }),
  ground_messages: (r: Row): GroundMessage => ({ id: s(r.id), crewId: s(r.crew_id), authorId: s(r.author_id), authorName: s(r.author_name), body: s(r.body), packetId: (r.packet_id as string | null) ?? undefined, createdAt: s(r.created_at), readAt: (r.read_at as string | null) ?? undefined }),
  mission_events: (r: Row): MissionEvent => ({ id: s(r.id), day: n(r.day), type: s(r.type) as MissionEventType, label: s(r.label), crewIds: arr<string>(r.crew_ids) }),
};
