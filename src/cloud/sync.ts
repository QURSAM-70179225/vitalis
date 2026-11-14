/**
 * Offline-first cloud sync with Supabase.
 *
 *  local write ──▶ IndexedDB + outbox ──(when online)──▶ Supabase (RLS-protected)
 *  Supabase ──(login pull + Realtime)──▶ IndexedDB ──▶ UI
 *
 * The app never waits for the network: everything works from IndexedDB, and the
 * outbox is flushed whenever a link is available (exactly like a deep-space DTN link).
 */
import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ChannelValues, EnvironmentId, Role, SyncTable } from '@/types';
import { db, wipeAll } from '@/store/db';
import { useApp } from '@/store/useApp';
import { on } from '@/utils/bus';
import { supabase } from './client';
import { fromRow, missionFromRow, profileToCrew, toRow, type MissionRow, type ProfileRow } from './mappers';

const PROFILE_CACHE = 'vitalis.profile';
const PAGE = 1000;

// ---------------------------------------------------------------------------
// Live crew telemetry received over Realtime Broadcast (ground console)
// ---------------------------------------------------------------------------
export interface LiveFrame {
  crewId: string;
  values: ChannelValues;
  at: number;
  eva: boolean;
}
export const useLiveCrew = create<{ frames: Record<string, LiveFrame>; set: (f: LiveFrame) => void }>((set, get) => ({
  frames: {},
  set: (f) => set({ frames: { ...get().frames, [f.crewId]: f } }),
}));

// ---------------------------------------------------------------------------
// Auth & missions
// ---------------------------------------------------------------------------
function need() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

function friendly(err: unknown): Error {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  if (/Invalid login credentials/i.test(msg)) return new Error('Wrong email or password.');
  if (/Email not confirmed/i.test(msg)) return new Error('Please confirm your email first (check your inbox), then sign in.');
  if (/already registered/i.test(msg)) return new Error('An account with this email already exists. Sign in instead.');
  if (/invalid invite code/i.test(msg)) return new Error('That invite code is not valid.');
  if (/Failed to fetch|NetworkError/i.test(msg)) return new Error('No connection to the server. Check your internet and try again.');
  return new Error(msg);
}

export async function signUp(email: string, password: string, name: string, callsign: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await need().auth.signUp({ email, password, options: { data: { name, callsign } } });
  if (error) throw friendly(error);
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await need().auth.signInWithPassword({ email, password });
  if (error) throw friendly(error);
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await need().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) throw friendly(error);
}

export async function signOut(): Promise<void> {
  teardown();
  await supabase?.auth.signOut();
  try {
    localStorage.removeItem(PROFILE_CACHE);
  } catch {
    /* ignore */
  }
  await useApp.getState().wipe();
  useApp.getState().setCloud({ userId: null, email: null, role: null, name: null, missionId: null, needsMission: false, state: 'signed-out', pending: 0 });
}

export async function createMission(name: string, environment: EnvironmentId, role: Role): Promise<void> {
  const { error } = await need().rpc('create_mission', { p_name: name, p_environment: environment, p_role: role });
  if (error) throw friendly(error);
  await bootstrap();
}

export async function joinMission(code: string, asCmo: boolean): Promise<void> {
  const { error } = await need().rpc('join_mission', { p_code: code, p_as_cmo: asCmo });
  if (error) throw friendly(error);
  await bootstrap();
}

export async function missionCodes(): Promise<{ crew_code: string; ground_code: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('mission_codes');
  if (error) throw friendly(error);
  return (data as { crew_code: string; ground_code: string }[] | null)?.[0] ?? null;
}

export async function acknowledgeAlert(id: string): Promise<void> {
  const { error } = await need().rpc('acknowledge_alert', { p_id: id });
  if (error) throw friendly(error);
  const a = useApp.getState().sharedAlerts.find((x) => x.id === id);
  const me = useApp.getState().cloud.userId ?? undefined;
  if (a) await useApp.getState().upsertSharedAlerts([{ ...a, acknowledgedAt: new Date().toISOString(), acknowledgedBy: me }], true);
}

export async function updateProfile(p: { name?: string; callsign?: string }): Promise<void> {
  const uid = useApp.getState().cloud.userId;
  if (!uid) return;
  const { error } = await need().from('profiles').update(p).eq('id', uid);
  if (error) throw friendly(error);
  await bootstrap();
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function updatePending() {
  useApp.getState().setCloud({ pending: await db.outbox.count() });
}

function scheduleFlush(ms = 800) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flushOutbox(), ms);
}

async function enqueue(table: SyncTable, row: Record<string, unknown>, id: string) {
  const { cloud, mission } = useApp.getState();
  if (!supabase || !cloud.userId || !mission?.cloudId || mission.demo) return;
  await db.outbox.add({ table, rowId: id, row: toRow(table, row, mission.cloudId), createdAt: new Date().toISOString(), tries: 0 });
  await updatePending();
  scheduleFlush();
}

export async function flushOutbox(): Promise<void> {
  const { cloud } = useApp.getState();
  if (!supabase || !cloud.userId || flushing) return;
  if (!navigator.onLine) {
    useApp.getState().setCloud({ state: 'offline' });
    return;
  }
  flushing = true;
  useApp.getState().setCloud({ state: 'syncing' });
  try {
    for (;;) {
      const batch = await db.outbox.orderBy('seq').limit(200).toArray();
      if (!batch.length) break;
      const table = batch[0].table;
      const items = batch.filter((b, i) => b.table === table && batch.slice(0, i).every((x) => x.table === table));
      // Keep only the newest version of each row in this batch.
      const latest = new Map(items.map((i) => [i.rowId, i.row]));
      const rows = [...latest.values()];
      let error: { message: string; code?: string } | null = null;
      if (table === 'ground_messages') {
        for (const r of rows) {
          const res =
            r.author_id === cloud.userId
              ? await supabase.from(table).upsert(r, { onConflict: 'id', ignoreDuplicates: true })
              : await supabase.from(table).update({ read_at: r.read_at }).eq('id', r.id as string);
          if (res.error) error = res.error;
        }
      } else if (table === 'mission_events') {
        error = (await supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true })).error;
      } else {
        error = (await supabase.from(table).upsert(rows, { onConflict: 'id' })).error;
      }
      const seqs = items.map((i) => i.seq!) as number[];
      if (error) {
        const network = /fetch|network|timeout/i.test(error.message);
        if (network) throw new Error(error.message);
        // Rejected by the server (e.g. permissions): retry a few times, then drop so the queue can't jam.
        await db.outbox.where('seq').anyOf(seqs).modify((o) => {
          o.tries += 1;
        });
        const dead = (await db.outbox.where('seq').anyOf(seqs).toArray()).filter((o) => o.tries >= 5).map((o) => o.seq!);
        if (dead.length) await db.outbox.bulkDelete(dead);
        useApp.getState().setCloud({ state: 'error', error: `${table}: ${error.message}` });
        break;
      }
      await db.outbox.bulkDelete(seqs);
    }
    const s = useApp.getState().cloud.state;
    if (s !== 'error') useApp.getState().setCloud({ state: 'synced', lastSync: new Date().toISOString(), error: null });
    if (useApp.getState().mission) await useApp.getState().updateMission({ lastGroundSync: new Date().toISOString() });
  } catch (err) {
    useApp.getState().setCloud({ state: navigator.onLine ? 'error' : 'offline', error: err instanceof Error ? err.message : String(err) });
  } finally {
    flushing = false;
    await updatePending();
  }
}

/** Waiting uploads, oldest first (for the Account & sync panel). */
export async function listOutbox(): Promise<{ seq: number; table: string; createdAt: string; tries: number }[]> {
  const items = await db.outbox.orderBy('seq').limit(50).toArray();
  return items.map((o) => ({ seq: o.seq!, table: o.table, createdAt: o.createdAt, tries: o.tries }));
}

/** Try uploading now (e.g. after fixing the database). */
export async function retrySync(): Promise<void> {
  useApp.getState().setCloud({ error: null });
  await flushOutbox();
}

/** Drop one stuck upload. The record itself stays on this device. */
export async function discardOutboxItem(seq: number): Promise<void> {
  await db.outbox.delete(seq);
  await updatePending();
  if ((await db.outbox.count()) === 0) useApp.getState().setCloud({ state: navigator.onLine ? 'synced' : 'offline', error: null });
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------
interface Filters {
  eq?: [string, string];
  gt?: [string, string];
}

async function fetchAll(table: string, f: Filters = {}): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = need().from(table).select('*');
    if (f.eq) q = q.eq(f.eq[0], f.eq[1]);
    if (f.gt) q = q.gt(f.gt[0], f.gt[1]);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw friendly(error);
    out.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function cacheProfile(p: ProfileRow | null) {
  try {
    if (p) localStorage.setItem(PROFILE_CACHE, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
function cachedProfile(): ProfileRow | null {
  try {
    const s = localStorage.getItem(PROFILE_CACHE);
    return s ? (JSON.parse(s) as ProfileRow) : null;
  } catch {
    return null;
  }
}

/** Load the signed-in user's profile + mission and download everything they may see. */
export async function bootstrap(): Promise<void> {
  if (!supabase) return;
  const { data: sess } = await supabase.auth.getSession();
  const user = sess.session?.user;
  if (!user) {
    useApp.getState().setCloud({ state: 'signed-out', userId: null });
    return;
  }
  let profile: ProfileRow | null = null;
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    profile = data as ProfileRow | null;
    cacheProfile(profile);
  } catch {
    profile = cachedProfile(); // offline start: use what we knew last time
  }
  const set = useApp.getState().setCloud;
  set({ userId: user.id, email: user.email ?? null, role: profile?.role ?? null, name: profile?.name ?? null, missionId: profile?.mission_id ?? null, needsMission: !profile?.mission_id });
  if (!profile?.mission_id) {
    set({ state: navigator.onLine ? 'synced' : 'offline' });
    return;
  }
  useApp.getState().setRole(profile.role);

  // Account switch / leaving demo mode: clear local data that belongs to someone else.
  const local = useApp.getState().mission;
  if (local && (local.demo || (local.cloudId && local.cloudId !== profile.mission_id))) {
    await wipeAll();
    await useApp.getState().init();
  }
  if (!navigator.onLine) {
    set({ state: 'offline' });
    return;
  }
  set({ state: 'syncing' });
  try {
    const mid = profile.mission_id;
    const [missionRes, crewRows] = await Promise.all([
      supabase.from('missions').select('id, name, environment_id, start_date, created_by').eq('id', mid).single(),
      fetchAll('profiles', { eq: ['mission_id', mid] }),
    ]);
    if (missionRes.error) throw missionRes.error;
    const crew = (crewRows as unknown as ProfileRow[]).map(profileToCrew);
    const firstCrew = crew.find((c) => c.missionRole !== 'ground')?.id ?? user.id;
    const active = profile.role === 'ground' ? (useApp.getState().mission?.activeCrewId && crew.some((c) => c.id === useApp.getState().mission!.activeCrewId) ? useApp.getState().mission!.activeCrewId : firstCrew) : user.id;
    const mission = missionFromRow(missionRes.data as MissionRow, active, useApp.getState().mission?.lastGroundSync ?? new Date().toISOString());
    const since = new Date(Date.now() - 48 * 3600_000).toISOString();
    const byMission: Filters = { eq: ['mission_id', mid] };
    const [checkIns, cognitive, packets, alerts, events, messages, vitals, journal] = await Promise.all([
      fetchAll('check_ins', byMission),
      fetchAll('cognitive_results', byMission),
      fetchAll('packets', byMission),
      fetchAll('alerts', byMission),
      fetchAll('mission_events', byMission),
      fetchAll('ground_messages', byMission),
      fetchAll('vital_samples', { eq: ['mission_id', mid], gt: ['ts', since] }),
      fetchAll('journal_entries'),
    ]);
    await useApp.getState().mergeRemote({
      mission,
      crew,
      checkIns: checkIns.map(fromRow.check_ins),
      cognitive: cognitive.map(fromRow.cognitive_results),
      packets: packets.map(fromRow.packets),
      sharedAlerts: alerts.map(fromRow.alerts),
      events: events.map(fromRow.mission_events),
      messages: messages.map(fromRow.ground_messages),
      vitals: vitals.map(fromRow.vital_samples),
      journal: journal.map(fromRow.journal_entries),
    });
    set({ state: 'synced', lastSync: new Date().toISOString(), error: null });
    await flushOutbox();
    subscribe(mid, user.id, profile.role);
  } catch (err) {
    set({ state: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------
let dbChannel: RealtimeChannel | null = null;
let liveChannel: RealtimeChannel | null = null;

function teardown() {
  if (dbChannel) void supabase?.removeChannel(dbChannel);
  if (liveChannel) void supabase?.removeChannel(liveChannel);
  dbChannel = liveChannel = null;
}

function subscribe(missionId: string, me: string, role: Role) {
  if (!supabase) return;
  teardown();
  const filter = `mission_id=eq.${missionId}`;
  const app = () => useApp.getState();
  const crewName = (id: string) => app().crew.find((c) => c.id === id)?.callsign ?? 'Crew';
  const watcher = role === 'ground' || role === 'cmo';
  type Payload = { new: Record<string, unknown> };

  dbChannel = supabase
    .channel(`db-${missionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins', filter }, (p: Payload) => void app().mergeRemote({ checkIns: [fromRow.check_ins(p.new)] }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cognitive_results', filter }, (p: Payload) => void app().mergeRemote({ cognitive: [fromRow.cognitive_results(p.new)] }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'packets', filter }, (p: Payload) => {
      const pk = fromRow.packets(p.new);
      void app().mergeRemote({ packets: [pk] });
      if (watcher && pk.crewId !== me) app().toast({ title: `📡 Health packet from ${crewName(pk.crewId)}`, body: pk.summary, level: pk.overall, action: { label: 'Open console', route: 'console' } });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vital_samples', filter }, (p: Payload) => void app().mergeRemote({ vitals: [fromRow.vital_samples(p.new)] }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter }, (p: Payload & { eventType?: string }) => {
      const a = fromRow.alerts(p.new);
      const isNew = !app().sharedAlerts.some((x) => x.id === a.id && x.level === a.level);
      void app().upsertSharedAlerts([a], true);
      if (watcher && isNew && a.crewId !== me && (a.level === 'critical' || a.level === 'act') && !a.acknowledgedAt) {
        app().toast({ title: `${a.level === 'critical' ? '🔴' : '🟠'} ${crewName(a.crewId)}: ${a.title}`, body: a.why[0], level: a.level, action: { label: 'Open console', route: 'console' } });
        if ('Notification' in window && Notification.permission === 'granted') new Notification(`VITALIS: ${crewName(a.crewId)}`, { body: a.title });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ground_messages', filter }, (p: Payload) => {
      const m = fromRow.ground_messages(p.new);
      const isNew = !app().messages.some((x) => x.id === m.id);
      void app().addMessage(m, true);
      if (isNew && m.crewId === me && m.authorId !== me) app().toast({ title: `📨 Message from ${m.authorName}`, body: m.body.slice(0, 120), level: 'info', action: { label: 'Read', route: 'ground' } });
    })
    .subscribe();

  liveChannel = supabase
    .channel(`live-${missionId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'frame' }, (m: { payload: LiveFrame }) => useLiveCrew.getState().set(m.payload))
    .subscribe();
}

function broadcastFrame(values: ChannelValues, at: number, eva: boolean) {
  const me = useApp.getState().cloud.userId;
  if (!liveChannel || !me || useApp.getState().mission?.demo) return;
  void liveChannel.send({ type: 'broadcast', event: 'frame', payload: { crewId: me, values, at, eva } satisfies LiveFrame });
}

// ---------------------------------------------------------------------------
// Wiring (called once from the app shell)
// ---------------------------------------------------------------------------
let started = false;

export function startCloud(): void {
  if (!supabase || started) return;
  started = true;
  useApp.getState().setCloud({ state: 'checking' });
  on('write', (e) => void enqueue(e.table, e.row, e.id));
  on('liveFrame', (e) => broadcastFrame(e.values, e.at, e.eva));
  window.addEventListener('online', () => {
    useApp.getState().setCloud({ state: 'syncing' });
    void bootstrap();
  });
  window.addEventListener('offline', () => useApp.getState().setCloud({ state: 'offline' }));
  setInterval(() => {
    if (navigator.onLine) void flushOutbox();
  }, 30_000);
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') void bootstrap();
    if (event === 'SIGNED_OUT') useApp.getState().setCloud({ state: 'signed-out', userId: null });
  });
  void updatePending();
}
