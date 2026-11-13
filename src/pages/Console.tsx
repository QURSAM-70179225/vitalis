import { useMemo, useState } from 'react';
import { Activity, BellRing, Check, FileText, MessageSquare, Radio, Satellite, Send, Siren } from 'lucide-react';
import type { ChannelId, ChannelValues, GroundMessage, SharedAlert } from '@/types';
import { useApp } from '@/store/useApp';
import { useAllTriage, useMissionContext } from '@/hooks/useMission';
import { navigate } from '@/hooks/useRoute';
import { useLiveCrew } from '@/cloud/sync';
import { acknowledgeAlert } from '@/cloud/sync';
import { useDevices } from '@/devices/hub';
import { CHANNELS } from '@/devices/channels';
import { liveLevel } from '@/devices/logic';
import { LEVEL_META, rank } from '@/engine/status';
import { buildReportPdf } from '@/features/ground/pdf';
import type { HealthPacket } from '@/features/ground/packet';
import { cn, downloadBlob, timeAgo } from '@/utils';
import { PageHeader, Panel, ProgressRing, StatusBadge, readinessColor } from '@/components/ui';

const LIVE_KEYS: ChannelId[] = ['hr', 'spo2', 'temp', 'resp', 'suitPressure', 'suitCo2', 'o2', 'doseRate'];

function LiveStrip({ values, at, eva }: { values: ChannelValues; at: number; eva: boolean }) {
  const fresh = Date.now() - at < 20_000;
  const keys = LIVE_KEYS.filter((k) => values[k] !== undefined && (eva || !CHANNELS[k].suit));
  return (
    <div className={cn('rounded-xl border p-2', fresh ? 'border-accent/30 bg-accent/5' : 'border-white/10 opacity-60')}>
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
        <span className={cn('h-2 w-2 rounded-full', fresh ? 'glow-pulse bg-critical' : 'bg-slate-500')} aria-hidden />
        {fresh ? 'Live' : `Last seen ${timeAgo(new Date(at).toISOString())}`}
        {eva && <span className="ml-auto rounded bg-accent/20 px-1.5 text-accent">EVA</span>}
      </p>
      <div className="grid grid-cols-4 gap-1">
        {keys.map((k) => {
          const v = values[k]!;
          const lvl = liveLevel(k, v);
          return (
            <div key={k} className="rounded-md bg-black/30 px-1.5 py-1" title={CHANNELS[k].label}>
              <p className="text-[9px] uppercase text-slate-400">{CHANNELS[k].short}</p>
              <p className="numeral text-sm" style={{ color: LEVEL_META[lvl].color }}>
                {v.toFixed(CHANNELS[k].digits)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Console() {
  const crewAll = useApp((s) => s.crew);
  const cloud = useApp((s) => s.cloud);
  const demo = useApp((s) => s.mission?.demo ?? false);
  const mission = useApp((s) => s.mission)!;
  const sharedAlerts = useApp((s) => s.sharedAlerts);
  const packets = useApp((s) => s.packets);
  const messages = useApp((s) => s.messages);
  const checkIns = useApp((s) => s.checkIns);
  const addMessage = useApp((s) => s.addMessage);
  const upsertSharedAlerts = useApp((s) => s.upsertSharedAlerts);
  const setActiveCrew = useApp((s) => s.setActiveCrew);
  const toast = useApp((s) => s.toast);
  const { day, env } = useMissionContext();
  const triageAll = useAllTriage();
  const cloudFrames = useLiveCrew((s) => s.frames);
  const localLatest = useDevices((s) => s.latest);
  const localEva = useDevices((s) => s.eva);
  const signedIn = !!cloud.userId && !demo;

  const crew = crewAll.filter((c) => c.missionRole !== 'ground');
  const [selected, setSelected] = useState<string>(crew[0]?.id ?? '');
  const [draft, setDraft] = useState('');
  const sel = crew.find((c) => c.id === selected) ?? crew[0];

  // Live frames: from Realtime when signed in; from this device's sensors in local/demo mode.
  const frames = useMemo(() => {
    if (signedIn) return cloudFrames;
    const values: ChannelValues = {};
    let at = 0;
    for (const [k, r] of Object.entries(localLatest)) {
      values[k as ChannelId] = r!.v;
      at = Math.max(at, r!.t);
    }
    return at ? { [mission.activeCrewId]: { crewId: mission.activeCrewId, values, at, eva: localEva } } : {};
  }, [signedIn, cloudFrames, localLatest, localEva, mission.activeCrewId]);

  const alertFeed = useMemo(
    () =>
      sharedAlerts
        .filter((a) => a.level === 'critical' || a.level === 'act')
        .slice()
        .sort((a, b) => Number(!!a.acknowledgedAt) - Number(!!b.acknowledgedAt) || rank(b.level) - rank(a.level) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 40),
    [sharedAlerts],
  );
  const openCritical = alertFeed.filter((a) => !a.acknowledgedAt && a.level === 'critical').length;

  const ack = async (a: SharedAlert) => {
    try {
      if (signedIn) await acknowledgeAlert(a.id);
      else await upsertSharedAlerts([{ ...a, acknowledgedAt: new Date().toISOString(), acknowledgedBy: 'ground' }], true);
    } catch (err) {
      toast({ title: 'Could not acknowledge', body: err instanceof Error ? err.message : '', level: 'act' });
    }
  };

  const send = async () => {
    if (!sel || !draft.trim()) return;
    const me = crewAll.find((c) => c.id === cloud.userId);
    const m: GroundMessage = {
      id: crypto.randomUUID(),
      crewId: sel.id,
      authorId: cloud.userId ?? 'ground-local',
      authorName: me ? `${me.name} (${me.callsign})` : 'Mission Control',
      body: draft.trim(),
      createdAt: new Date().toISOString(),
    };
    await addMessage(m);
    setDraft('');
    toast({ title: `Message queued for ${sel.callsign}`, body: signedIn ? 'Delivered when their link is up.' : 'Stored locally (demo).', level: 'info' });
  };

  if (signedIn && cloud.role === 'astronaut') {
    return <PageHeader title="Ground Console" subtitle="Only Mission Control and the Crew Medical Officer can open the console." />;
  }

  const thread = messages.filter((m) => m.crewId === sel?.id).slice(-30);
  const crewPackets = packets.filter((p) => p.crewId === sel?.id).slice(-6).reverse();
  const selTriage = triageAll.find((t) => t.crewId === sel?.id);

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Satellite className="h-3.5 w-3.5" aria-hidden /> Mission Control · {mission.name} · {env.short} · SOL {day}
          </span>
        }
        title="Ground Console"
        subtitle={
          signedIn
            ? 'Live view of your crew. Alerts and packets arrive in real time; sensor streams update every 2 s while a crew member is connected.'
            : 'Demo console: shows the seeded crew. Start a simulator on the Live Monitor page to see a live stream here.'
        }
        actions={
          openCritical > 0 ? (
            <span className="chip glow-pulse border-critical text-sm text-critical">
              <Siren className="h-4 w-4" aria-hidden /> {openCritical} critical unacknowledged
            </span>
          ) : (
            <span className="chip text-sm text-nominal">
              <Check className="h-4 w-4" aria-hidden /> No open critical alerts
            </span>
          )
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-tour="console-crew">
        {crew.map((c) => {
          const t = triageAll.find((x) => x.crewId === c.id);
          const f = frames[c.id];
          const last = checkIns.filter((x) => x.crewId === c.id).at(-1);
          const liveCrit = f && LIVE_KEYS.some((k) => f.values[k] !== undefined && liveLevel(k, f.values[k]!) === 'critical') && Date.now() - f.at < 20_000;
          const overall = liveCrit ? 'critical' : t?.overall ?? 'nominal';
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              aria-pressed={sel?.id === c.id}
              className={cn('panel focus-ring flex flex-col gap-2 border-2 p-4 text-left transition', LEVEL_META[overall].border, sel?.id === c.id && 'ring-2 ring-accent')}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-semibold">{c.callsign}</p>
                  <p className="muted text-xs">
                    {c.name} · {c.role}
                  </p>
                </div>
                {t && (
                  <ProgressRing value={t.readiness} size={48} stroke={5} color={readinessColor(t.readiness)} label={`Readiness ${t.readiness}`}>
                    <span className="numeral text-xs">{t.readiness}</span>
                  </ProgressRing>
                )}
              </div>
              <StatusBadge level={overall} size="sm" />
              <p className="min-h-[2.5rem] text-sm">{liveCrit ? 'Live sensor emergency' : t?.alerts[0]?.title ?? 'All systems nominal'}</p>
              {f ? <LiveStrip values={f.values} at={f.at} eva={f.eva} /> : <p className="muted text-xs">No live sensor stream</p>}
              <p className="muted text-[11px]">Last check-in {last ? timeAgo(last.timestamp) : 'never'}</p>
            </button>
          );
        })}
        {!crew.length && <p className="muted">No crew have joined yet. Share the crew invite code from Settings.</p>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Panel aria-labelledby="feed-h">
          <h2 id="feed-h" className="h2 mb-3 flex items-center gap-2">
            <BellRing className="h-5 w-5 text-critical" aria-hidden /> Alert feed (act & critical)
          </h2>
          {alertFeed.length ? (
            <ul className="space-y-2">
              {alertFeed.map((a) => {
                const c = crew.find((x) => x.id === a.crewId);
                return (
                  <li key={a.id} className={cn('flex items-start gap-3 rounded-xl border p-3', LEVEL_META[a.level].border, a.acknowledgedAt && 'opacity-50')}>
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: LEVEL_META[a.level].color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {c?.callsign ?? 'Crew'} · {a.title}
                        {a.source === 'live' && <span className="ml-1.5 rounded bg-critical/20 px-1 text-[10px] text-critical">SENSOR</span>}
                      </p>
                      <p className="muted text-xs">{a.why[0]}</p>
                      <p className="muted text-[11px]">
                        {timeAgo(a.createdAt)}
                        {a.acknowledgedAt ? ` · acknowledged ${timeAgo(a.acknowledgedAt)}` : ''}
                      </p>
                    </div>
                    {!a.acknowledgedAt && (
                      <button className="btn-ghost h-9 min-h-0 shrink-0 px-3 text-xs" onClick={() => void ack(a)}>
                        <Check className="h-3.5 w-3.5" aria-hidden /> Ack
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted text-sm">No act/critical alerts reported yet. (Triage alerts are shared by each astronaut's device; sensor alarms appear instantly.)</p>
          )}
        </Panel>

        <Panel aria-labelledby="sel-h">
          {sel ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="sel-h" className="h2">
                  {sel.callsign}: {sel.name}
                </h2>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    await setActiveCrew(sel.id);
                    navigate('dashboard');
                  }}
                >
                  <Activity className="h-4 w-4" aria-hidden /> Full dashboard
                </button>
              </div>
              {selTriage && selTriage.alerts.length > 0 && (
                <ul className="mb-4 space-y-1 text-sm">
                  {selTriage.alerts.slice(0, 3).map((a) => (
                    <li key={a.id} className="flex items-start gap-2">
                      <StatusBadge level={a.level} size="sm" short /> <span>{a.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="eyebrow mb-2 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Messages
              </h3>
              <ul className="mb-3 max-h-64 space-y-2 overflow-y-auto" aria-live="polite">
                {thread.map((m) => (
                  <li key={m.id} className="rounded-xl bg-white/5 p-2 text-sm">
                    <span className="font-semibold">{m.authorName}</span> <span className="muted text-xs">· {timeAgo(m.createdAt)}{m.readAt ? ' · read' : ''}</span>
                    <p className="whitespace-pre-line">{m.body}</p>
                  </li>
                ))}
                {!thread.length && <li className="muted text-sm">No messages yet.</li>}
              </ul>
              <form
                className="mb-5 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <label htmlFor="msg" className="sr-only">
                  Message to {sel.callsign}
                </label>
                <textarea id="msg" className="field min-h-[48px]" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Guidance for ${sel.callsign}…`} />
                <button className="btn-primary shrink-0" disabled={!draft.trim()}>
                  <Send className="h-4 w-4" aria-hidden /> Send
                </button>
              </form>
              <h3 className="eyebrow mb-2 flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5" aria-hidden /> Health packets
              </h3>
              <ul className="space-y-2">
                {crewPackets.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-xl bg-white/5 p-2 text-sm">
                    <StatusBadge level={p.overall} size="sm" short />
                    <span className="min-w-0 flex-1 truncate">
                      SOL {p.day} · {p.summary}
                    </span>
                    {p.payload ? (
                      <button className="btn-ghost h-9 min-h-0 px-2 text-xs" onClick={async () => downloadBlob(await buildReportPdf(p.payload as HealthPacket), `vitalis-${sel.callsign}-sol${p.day}.pdf`)}>
                        <FileText className="h-3.5 w-3.5" aria-hidden /> PDF
                      </button>
                    ) : null}
                  </li>
                ))}
                {!crewPackets.length && <li className="muted text-sm">No packets yet.</li>}
              </ul>
            </>
          ) : (
            <p className="muted">Select a crew member.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
