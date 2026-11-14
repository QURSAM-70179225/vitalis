import { create } from 'zustand';
import type {
  Attachment,
  CheckIn,
  CognitiveResult,
  CrewMember,
  EnvironmentId,
  GroundPacket,
  JournalEntry,
  Mission,
  MissionEvent,
  Role,
  Settings,
  StatusLevel,
  GroundMessage,
  SharedAlert,
  SyncTable,
  VitalSample,
} from '@/types';
import { emit } from '@/utils/bus';
import { db, exportAll, importAll, wipeAll, type ExportBundle } from './db';
import { generateDemoData } from '@/data/seed';
import { uid } from '@/utils';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  units: { temperature: 'C', mass: 'kg', glucose: 'mg/dL' },
  highContrast: false,
  reducedMotion: false,
  aiEnabled: false,
  notifications: true,
  passcodeHash: null,
  passcodeSalt: null,
  timeWarp: 20,
  thresholdOverrides: {},
  tourSeen: false,
  alertSound: true,
};

export interface Toast {
  id: string;
  title: string;
  body?: string;
  level?: StatusLevel | 'info';
  action?: { label: string; route: string };
}

interface AppState {
  ready: boolean;
  mission: Mission | null;
  settings: Settings;
  crew: CrewMember[];
  checkIns: CheckIn[];
  cognitive: CognitiveResult[];
  journal: JournalEntry[];
  events: MissionEvent[];
  attachments: Attachment[];
  packets: GroundPacket[];
  role: Role;
  locked: boolean;
  calmMode: boolean;
  tourOpen: boolean;
  assistantOpen: boolean;
  toasts: Toast[];
  vitals: VitalSample[];
  messages: GroundMessage[];
  sharedAlerts: SharedAlert[];
  /** Cloud sync status (only meaningful when Supabase is configured). */
  cloud: CloudStatus;
  setCloud: (p: Partial<CloudStatus>) => void;
  addVitalSample: (v: VitalSample) => Promise<void>;
  upsertSharedAlerts: (a: SharedAlert[], fromRemote?: boolean) => Promise<void>;
  addMessage: (m: GroundMessage, fromRemote?: boolean) => Promise<void>;
  markMessageRead: (id: string) => Promise<void>;
  /** Merge rows downloaded from the cloud (no re-upload). */
  mergeRemote: (p: RemoteData) => Promise<void>;
  /** Transient: heart rate captured by the camera, picked up by the check-in wizard. */
  cameraHr: number | null;
  setCameraHr: (v: number | null) => void;

  init: () => Promise<void>;
  setupMission: (p: { missionName: string; environmentId: EnvironmentId; member: Omit<CrewMember, 'id'> }) => Promise<void>;
  loadDemo: () => Promise<void>;
  wipe: () => Promise<void>;
  exportData: () => Promise<ExportBundle>;
  importData: (b: ExportBundle) => Promise<void>;
  updateMission: (p: Partial<Mission>) => Promise<void>;
  updateSettings: (p: Partial<Settings>) => Promise<void>;
  setActiveCrew: (id: string) => Promise<void>;
  addCrew: (m: Omit<CrewMember, 'id'>) => Promise<void>;
  setRole: (r: Role) => void;
  addCheckIn: (c: CheckIn) => Promise<void>;
  addCognitive: (c: CognitiveResult) => Promise<void>;
  addJournal: (j: JournalEntry) => Promise<void>;
  addAttachment: (a: Attachment) => Promise<void>;
  removeAttachment: (id: string) => Promise<void>;
  addEvent: (e: MissionEvent) => Promise<void>;
  upsertPacket: (p: GroundPacket) => Promise<void>;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  setCalm: (v: boolean) => void;
  setTour: (v: boolean) => void;
  setAssistant: (v: boolean) => void;
  lock: () => void;
  unlock: () => void;
}

export interface CloudStatus {
  userId: string | null;
  email: string | null;
  /** Mission role from the server profile. */
  role: Role | null;
  name: string | null;
  missionId: string | null;
  /** Signed in but not yet in a mission. */
  needsMission: boolean;
  state: 'disabled' | 'checking' | 'signed-out' | 'offline' | 'syncing' | 'synced' | 'error';
  pending: number;
  lastSync: string | null;
  error: string | null;
}

export interface RemoteData {
  mission?: Mission;
  crew?: CrewMember[];
  checkIns?: CheckIn[];
  cognitive?: CognitiveResult[];
  journal?: JournalEntry[];
  events?: MissionEvent[];
  packets?: GroundPacket[];
  vitals?: VitalSample[];
  messages?: GroundMessage[];
  sharedAlerts?: SharedAlert[];
}

/** Notify the sync layer about a local write (ignored when not signed in). */
function mirror(table: SyncTable, row: { id: string }) {
  emit('write', { table, row: row as unknown as Record<string, unknown>, id: row.id });
}

function mergeById<T extends { id: string }>(cur: T[], incoming: T[], sort?: (a: T, b: T) => number): T[] {
  if (!incoming.length) return cur;
  const m = new Map(cur.map((x) => [x.id, x]));
  for (const x of incoming) m.set(x.id, x);
  const out = [...m.values()];
  return sort ? out.sort(sort) : out;
}

const byDayTs = (a: { day: number; timestamp: string }, b: { day: number; timestamp: string }) => a.day - b.day || a.timestamp.localeCompare(b.timestamp);
const VITALS_KEEP_MS = 7 * 86_400_000;

async function loadFromDb() {
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
  const since = new Date(Date.now() - VITALS_KEEP_MS).toISOString();
  const [vitals, messages, sharedAlerts] = await Promise.all([
    db.vitals.where('ts').above(since).sortBy('ts'),
    db.messages.orderBy('createdAt').toArray(),
    db.alerts.orderBy('createdAt').toArray(),
  ]);
  const byDay = <T extends { day: number }>(a: T, b: T) => a.day - b.day;
  return {
    mission: mission ?? null,
    settings: { ...DEFAULT_SETTINGS, ...settings, units: { ...DEFAULT_SETTINGS.units, ...settings?.units } },
    crew,
    checkIns: checkIns.sort(byDay),
    cognitive: cognitive.sort(byDay),
    journal: journal.sort(byDay),
    events: events.sort(byDay),
    attachments,
    packets: packets.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    vitals,
    messages,
    sharedAlerts,
  };
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  mission: null,
  settings: DEFAULT_SETTINGS,
  crew: [],
  checkIns: [],
  cognitive: [],
  journal: [],
  events: [],
  attachments: [],
  packets: [],
  role: 'astronaut',
  locked: false,
  calmMode: false,
  tourOpen: false,
  assistantOpen: false,
  toasts: [],
  cameraHr: null,
  setCameraHr: (cameraHr) => set({ cameraHr }),
  vitals: [],
  messages: [],
  sharedAlerts: [],
  cloud: { userId: null, email: null, role: null, name: null, missionId: null, needsMission: false, state: 'disabled', pending: 0, lastSync: null, error: null },
  setCloud: (p) => set({ cloud: { ...get().cloud, ...p } }),

  addVitalSample: async (v) => {
    await db.vitals.put(v);
    const cutoff = new Date(Date.now() - VITALS_KEEP_MS).toISOString();
    set({ vitals: [...get().vitals.filter((x) => x.ts > cutoff), v] });
    mirror('vital_samples', v);
  },
  upsertSharedAlerts: async (alerts, fromRemote = false) => {
    if (!alerts.length) return;
    await db.alerts.bulkPut(alerts);
    set({ sharedAlerts: mergeById(get().sharedAlerts, alerts, (a, b) => a.createdAt.localeCompare(b.createdAt)) });
    if (!fromRemote) alerts.forEach((a) => mirror('alerts', a));
  },
  addMessage: async (m, fromRemote = false) => {
    await db.messages.put(m);
    set({ messages: mergeById(get().messages, [m], (a, b) => a.createdAt.localeCompare(b.createdAt)) });
    if (!fromRemote) mirror('ground_messages', m);
  },
  markMessageRead: async (id) => {
    const m = get().messages.find((x) => x.id === id);
    if (!m || m.readAt) return;
    const next = { ...m, readAt: new Date().toISOString() };
    await db.messages.put(next);
    set({ messages: get().messages.map((x) => (x.id === id ? next : x)) });
    mirror('ground_messages', next);
  },
  mergeRemote: async (p) => {
    await db.transaction('rw', [db.mission, db.crew, db.checkIns, db.cognitive, db.journal, db.events, db.packets, db.vitals, db.messages, db.alerts], async () => {
      if (p.mission) await db.mission.put(p.mission);
      if (p.crew) {
        await db.crew.clear();
        await db.crew.bulkPut(p.crew);
      }
      if (p.checkIns) await db.checkIns.bulkPut(p.checkIns);
      if (p.cognitive) await db.cognitive.bulkPut(p.cognitive);
      if (p.journal) await db.journal.bulkPut(p.journal);
      if (p.events) await db.events.bulkPut(p.events);
      if (p.packets) await db.packets.bulkPut(p.packets);
      if (p.vitals) await db.vitals.bulkPut(p.vitals);
      if (p.messages) await db.messages.bulkPut(p.messages);
      if (p.sharedAlerts) await db.alerts.bulkPut(p.sharedAlerts);
    });
    const s = get();
    set({
      mission: p.mission ? { ...p.mission, activeCrewId: s.mission?.activeCrewId && p.crew?.some((c) => c.id === s.mission!.activeCrewId) ? s.mission.activeCrewId : p.mission.activeCrewId } : s.mission,
      crew: p.crew ?? s.crew,
      checkIns: mergeById(s.checkIns, p.checkIns ?? [], byDayTs),
      cognitive: mergeById(s.cognitive, p.cognitive ?? [], byDayTs),
      journal: mergeById(s.journal, p.journal ?? [], byDayTs),
      events: mergeById(s.events, p.events ?? [], (a, b) => a.day - b.day),
      packets: mergeById(s.packets, p.packets ?? [], (a, b) => a.createdAt.localeCompare(b.createdAt)),
      vitals: mergeById(s.vitals, p.vitals ?? [], (a, b) => a.ts.localeCompare(b.ts)),
      messages: mergeById(s.messages, p.messages ?? [], (a, b) => a.createdAt.localeCompare(b.createdAt)),
      sharedAlerts: mergeById(s.sharedAlerts, p.sharedAlerts ?? [], (a, b) => a.createdAt.localeCompare(b.createdAt)),
    });
  },

  init: async () => {
    try {
      const data = await loadFromDb();
      set({ ...data, ready: true, locked: !!data.settings.passcodeHash });
    } catch (err) {
      // IndexedDB can be unavailable (private mode); fall back to in-memory.
      console.warn('IndexedDB unavailable, running in memory', err);
      set({ ready: true });
    }
  },

  setupMission: async ({ missionName, environmentId, member }) => {
    const crewMember: CrewMember = { ...member, id: uid('crew-') };
    const now = new Date();
    const mission: Mission = {
      id: 'mission',
      name: missionName,
      environmentId,
      startDate: now.toISOString(),
      activeCrewId: crewMember.id,
      lastGroundSync: now.toISOString(),
      demo: false,
    };
    await db.mission.put(mission);
    await db.crew.put(crewMember);
    await db.settings.put(get().settings);
    set({ mission, crew: [...get().crew, crewMember] });
  },

  loadDemo: async () => {
    const demo = generateDemoData();
    const settings = { ...get().settings, tourSeen: false };
    await wipeAll();
    await db.transaction('rw', db.tables, async () => {
      await db.mission.put(demo.mission);
      await db.settings.put(settings);
      await db.crew.bulkPut(demo.crew);
      await db.checkIns.bulkPut(demo.checkIns);
      await db.cognitive.bulkPut(demo.cognitive);
      await db.journal.bulkPut(demo.journal);
      await db.events.bulkPut(demo.events);
      await db.packets.bulkPut(demo.packets);
    });
    set({ ...demo, settings, attachments: [], vitals: [], messages: [], sharedAlerts: [], role: 'astronaut', calmMode: false, locked: false });
  },

  wipe: async () => {
    await wipeAll();
    set({
      mission: null,
      settings: DEFAULT_SETTINGS,
      crew: [],
      checkIns: [],
      cognitive: [],
      journal: [],
      events: [],
      attachments: [],
      packets: [],
      vitals: [],
      messages: [],
      sharedAlerts: [],
      role: 'astronaut',
      locked: false,
      calmMode: false,
    });
  },

  exportData: () => exportAll(),
  importData: async (b) => {
    await importAll(b);
    const data = await loadFromDb();
    set({ ...data });
  },

  updateMission: async (p) => {
    const m = get().mission;
    if (!m) return;
    const next = { ...m, ...p };
    set({ mission: next });
    await db.mission.put(next);
  },

  updateSettings: async (p) => {
    const next = { ...get().settings, ...p };
    set({ settings: next });
    await db.settings.put(next);
  },

  setActiveCrew: async (id) => {
    await get().updateMission({ activeCrewId: id });
  },

  addCrew: async (m) => {
    const c: CrewMember = { ...m, id: uid('crew-') };
    await db.crew.put(c);
    set({ crew: [...get().crew, c] });
  },

  setRole: (role) => set({ role }),

  addCheckIn: async (c) => {
    await db.checkIns.put(c);
    set({ checkIns: [...get().checkIns.filter((x) => x.id !== c.id), c].sort(byDayTs) });
    mirror('check_ins', c);
  },
  addCognitive: async (c) => {
    await db.cognitive.put(c);
    set({ cognitive: [...get().cognitive, c] });
    mirror('cognitive_results', c);
  },
  addJournal: async (j) => {
    await db.journal.put(j);
    set({ journal: [...get().journal, j] });
    mirror('journal_entries', j);
  },
  addAttachment: async (a) => {
    await db.attachments.put(a);
    set({ attachments: [...get().attachments, a] });
  },
  removeAttachment: async (id) => {
    await db.attachments.delete(id);
    set({ attachments: get().attachments.filter((a) => a.id !== id) });
  },
  addEvent: async (e) => {
    await db.events.put(e);
    set({ events: [...get().events, e].sort((a, b) => a.day - b.day) });
    mirror('mission_events', e);
  },
  upsertPacket: async (p) => {
    await db.packets.put(p);
    const others = get().packets.filter((x) => x.id !== p.id);
    set({ packets: [...others, p].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
    mirror('packets', p);
  },

  toast: (t) => {
    const id = uid('t-');
    set({ toasts: [...get().toasts, { ...t, id }].slice(-4) });
    setTimeout(() => get().dismissToast(id), 7000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setCalm: (calmMode) => set({ calmMode }),
  setTour: (tourOpen) => set({ tourOpen }),
  setAssistant: (assistantOpen) => set({ assistantOpen }),
  lock: () => set({ locked: !!get().settings.passcodeHash }),
  unlock: () => set({ locked: false }),
}));
