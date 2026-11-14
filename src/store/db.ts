import Dexie, { type EntityTable } from 'dexie';
import type {
  Attachment,
  CheckIn,
  CognitiveResult,
  CrewMember,
  GroundPacket,
  JournalEntry,
  Mission,
  MissionEvent,
  Settings,
  GroundMessage,
  OutboxItem,
  SharedAlert,
  SyncTables,
  VitalSample,
} from '@/types';

/**
 * Local-first IndexedDB storage. Every write lands here first. In local/demo mode nothing leaves the
 * device unless the user sends it; with an account, writes are also queued in `outbox` and uploaded
 * by src/cloud/sync.ts when a connection exists.
 */
export class VitalisDB extends Dexie {
  mission!: EntityTable<Mission, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  crew!: EntityTable<CrewMember, 'id'>;
  checkIns!: EntityTable<CheckIn, 'id'>;
  cognitive!: EntityTable<CognitiveResult, 'id'>;
  journal!: EntityTable<JournalEntry, 'id'>;
  events!: EntityTable<MissionEvent, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  packets!: EntityTable<GroundPacket, 'id'>;
  vitals!: EntityTable<VitalSample, 'id'>;
  messages!: EntityTable<GroundMessage, 'id'>;
  alerts!: EntityTable<SharedAlert, 'id'>;
  /** Writes waiting to be uploaded to Supabase (survives reloads and long offline periods). */
  outbox!: EntityTable<OutboxItem, 'seq'>;

  constructor() {
    super('vitalis');
    this.version(1).stores({
      mission: 'id',
      settings: 'id',
      crew: 'id',
      checkIns: 'id, crewId, day',
      cognitive: 'id, crewId, day',
      journal: 'id, crewId, day',
      events: 'id, day',
      attachments: 'id, crewId, system',
      packets: 'id, crewId, status',
    });
    this.version(2).stores({
      vitals: 'id, crewId, ts',
      messages: 'id, crewId, createdAt',
      alerts: 'id, crewId, createdAt',
      outbox: '++seq, table',
    });
  }
}

export const db = new VitalisDB();

export interface ExportBundle {
  app: 'vitalis';
  version: 1;
  exportedAt: string;
  mission: Mission | null;
  settings: Settings | null;
  crew: CrewMember[];
  checkIns: CheckIn[];
  cognitive: CognitiveResult[];
  journal: JournalEntry[];
  events: MissionEvent[];
  attachments: Attachment[];
  packets: GroundPacket[];
}

export async function exportAll(): Promise<ExportBundle> {
  const [mission, settings, crew, checkIns, cognitive, journal, events, attachments, packets] = await Promise.all([
    db.mission.get('mission'),
    db.settings.get('settings'),
    db.crew.toArray(),
    db.checkIns.toArray(),
    db.cognitive.toArray(),
    db.journal.toArray(),
    db.events.toArray(),
    db.attachments.toArray(),
    db.packets.toArray(),
  ]);
  return {
    app: 'vitalis',
    version: 1,
    exportedAt: new Date().toISOString(),
    mission: mission ?? null,
    settings: settings ? { ...settings, passcodeHash: null, passcodeSalt: null } : null,
    crew,
    checkIns,
    cognitive,
    journal,
    events,
    attachments,
    packets,
  };
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

export async function importAll(b: ExportBundle): Promise<void> {
  await wipeAll();
  await db.transaction('rw', db.tables, async () => {
    if (b.mission) await db.mission.put(b.mission);
    if (b.settings) await db.settings.put(b.settings);
    await db.crew.bulkPut(b.crew);
    await db.checkIns.bulkPut(b.checkIns);
    await db.cognitive.bulkPut(b.cognitive);
    await db.journal.bulkPut(b.journal);
    await db.events.bulkPut(b.events);
    await db.attachments.bulkPut(b.attachments);
    await db.packets.bulkPut(b.packets);
  });
}

export function isExportBundle(x: unknown): x is ExportBundle {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return o.app === 'vitalis' && Array.isArray(o.checkIns) && Array.isArray(o.crew);
}

/** Everything a hand-off file carries (no settings, no passcode, no outbox). */
export async function readSyncTables(): Promise<SyncTables & { mission: Mission | null }> {
  const [mission, crew, checkIns, cognitive, journal, events, attachments, packets, vitals, messages, alerts] = await Promise.all([
    db.mission.get('mission'),
    db.crew.toArray(),
    db.checkIns.toArray(),
    db.cognitive.toArray(),
    db.journal.toArray(),
    db.events.toArray(),
    db.attachments.toArray(),
    db.packets.toArray(),
    db.vitals.toArray(),
    db.messages.toArray(),
    db.alerts.toArray(),
  ]);
  return { mission: mission ?? null, crew, checkIns, cognitive, journal, events, attachments, packets, vitals, messages, alerts };
}

/** Write merged rows in one transaction (all or nothing). */
export async function writeSyncTables(w: SyncTables, mission?: Mission | null): Promise<void> {
  await db.transaction('rw', [db.mission, db.crew, db.checkIns, db.cognitive, db.journal, db.events, db.attachments, db.packets, db.vitals, db.messages, db.alerts], async () => {
    if (mission) await db.mission.put(mission);
    await db.crew.bulkPut(w.crew);
    await db.checkIns.bulkPut(w.checkIns);
    await db.cognitive.bulkPut(w.cognitive);
    await db.journal.bulkPut(w.journal);
    await db.events.bulkPut(w.events);
    await db.attachments.bulkPut(w.attachments);
    await db.packets.bulkPut(w.packets);
    await db.vitals.bulkPut(w.vitals);
    await db.messages.bulkPut(w.messages);
    await db.alerts.bulkPut(w.alerts);
  });
}
