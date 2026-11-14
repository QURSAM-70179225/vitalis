import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Download, FileJson, FileText, Globe2, Lock, MessageSquareReply, Rocket, Satellite, Send } from 'lucide-react';
import type { GroundPacket } from '@/types';
import { useApp } from '@/store/useApp';
import { useCrewData, useMissionContext, useTriage } from '@/hooks/useMission';
import { formatDelay } from '@/data/environments';
import { roughDuration } from '@/engine/escalation';
import { LEVEL_META } from '@/engine/status';
import { buildPacket } from '@/features/ground/packet';
import { buildReportPdf } from '@/features/ground/pdf';
import { packetTimeline, SURGEON_THINK_SEC } from '@/features/ground/useGroundLink';
import { cn, downloadBlob, formatBytes, gzipSize, uid } from '@/utils';
import { PageHeader, Panel, StatusBadge } from '@/components/ui';

function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function PacketRow({ p }: { p: GroundPacket }) {
  const warp = useApp((s) => s.settings.timeWarp);
  const crew = useApp((s) => s.crew);
  const now = useNow();
  const { sent, deliverAt, replyAt } = packetTimeline(p, warp);
  const c = crew.find((x) => x.id === p.crewId);
  const cloud = useApp((s) => s.cloud);
  const real = !!cloud.userId && !useApp.getState().mission?.demo && p.payload !== undefined;
  let pct = 100;
  let label = 'Reply received';
  if (real) {
    // Real link: delivered once the outbox has uploaded it.
    const waiting = cloud.pending > 0 && (cloud.state === 'offline' || cloud.state === 'syncing' || cloud.state === 'error');
    pct = waiting ? 35 : 100;
    label = waiting ? 'In outbox: uploads automatically when the link is up' : 'Delivered to Mission Control';
  } else if (p.status === 'queued' || p.status === 'transmitting') {
    pct = Math.min(100, ((now - sent) / (deliverAt - sent)) * 100);
    label = `Transmitting… ${Math.max(0, Math.ceil((deliverAt - now) / 1000))} s (demo time) · ${formatDelay(p.delaySec)} light-time`;
  } else if (p.status === 'delivered') {
    pct = 100;
    label = `Delivered. Awaiting flight surgeon (~${Math.max(0, Math.ceil((replyAt - now) / 1000))} s demo time)`;
  }
  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge level={p.overall} size="sm" />
          <span className="font-semibold">{c?.callsign}</span>
          <span className="muted text-sm">· SOL {p.day} · {p.summary}</span>
        </div>
        <span className="muted text-xs">
          {formatBytes(p.rawBytes)} → {formatBytes(p.compressedBytes)} gzip
        </span>
      </div>
      <div className="mt-3">
        <div className="relative h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Transmission progress">
          <motion.div className={cn('h-full rounded-full', p.status === 'replied' ? 'bg-nominal' : 'bg-accent')} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1">
            <Rocket className="h-3.5 w-3.5 text-accent" aria-hidden /> Spacecraft
          </span>
          <span className="muted" aria-live="polite">
            {label}
          </span>
          <span className="flex items-center gap-1">
            Earth <Globe2 className="h-3.5 w-3.5 text-accent" aria-hidden />
          </span>
        </div>
      </div>
      {p.deliveredAt && (
        <p className="muted mt-2 flex items-center gap-1 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 text-nominal" aria-hidden /> Delivered {new Date(p.deliveredAt).toLocaleString()}
        </p>
      )}
      {p.reply && (
        <div className="mt-3 rounded-xl border border-nominal/30 bg-nominal/5 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-nominal">
            <MessageSquareReply className="h-4 w-4" aria-hidden /> Flight surgeon reply {p.replyAt && <span className="muted text-xs font-normal">· {new Date(p.replyAt).toLocaleString()}</span>}
          </p>
          <p className="whitespace-pre-line">{p.reply}</p>
        </div>
      )}
    </li>
  );
}

function Inbox() {
  const me = useMissionContext().crewMember;
  const messages = useApp((s) => s.messages).filter((m) => m.crewId === me?.id);
  const markRead = useApp((s) => s.markMessageRead);
  const unread = messages.filter((m) => !m.readAt);
  useEffect(() => {
    // Opening this page counts as reading the messages.
    const t = setTimeout(() => unread.forEach((m) => void markRead(m.id)), 1500);
    return () => clearTimeout(t);
  }, [unread, markRead]);
  if (!messages.length) return null;
  return (
    <div className="mb-5">
      <h2 className="h2 mb-3 flex items-center gap-2">
        <MessageSquareReply className="h-5 w-5 text-nominal" aria-hidden /> Messages from Mission Control
        {unread.length > 0 && <span className="chip border-nominal text-nominal">{unread.length} new</span>}
      </h2>
      <ul className="space-y-2">
        {messages
          .slice(-10)
          .reverse()
          .map((m) => (
            <li key={m.id} className={cn('rounded-xl border p-3 text-sm', m.readAt ? 'border-white/10 bg-white/5' : 'border-nominal/40 bg-nominal/5')}>
              <p className="mb-1 font-semibold text-nominal">
                {m.authorName} <span className="muted text-xs font-normal">· {new Date(m.createdAt).toLocaleString()}</span>
              </p>
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          ))}
      </ul>
    </div>
  );
}

export default function Ground() {
  const mission = useApp((s) => s.mission)!;
  const packets = useApp((s) => s.packets);
  const upsertPacket = useApp((s) => s.upsertPacket);
  const warp = useApp((s) => s.settings.timeWarp);
  const { env, day, delaySec, crewMember } = useMissionContext();
  const signedIn = useApp((s) => !!s.cloud.userId && !s.mission?.demo);
  const triage = useTriage();
  const { checkIns, cognitive } = useCrewData();
  const [size, setSize] = useState<{ raw: number; gz: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const packet = useMemo(
    () => (triage && crewMember ? buildPacket({ missionName: mission.name, env, day, delaySec, crew: crewMember, triage, checkIns, cognitive }) : null),
    [triage, crewMember, mission.name, env, day, delaySec, checkIns, cognitive],
  );
  const json = useMemo(() => (packet ? JSON.stringify(packet) : ''), [packet]);

  useEffect(() => {
    let alive = true;
    void gzipSize(json).then((r) => alive && setSize({ raw: new Blob([json]).size, gz: r.bytes }));
    return () => {
      alive = false;
    };
  }, [json]);

  if (!packet || !triage || !crewMember) return null;

  const send = async () => {
    setBusy(true);
    const gz = await gzipSize(json);
    const top = triage.alerts[0];
    await upsertPacket({
      id: uid('pkt-'),
      crewId: crewMember.id,
      createdAt: new Date().toISOString(),
      day,
      rawBytes: new Blob([json]).size,
      compressedBytes: gz.bytes,
      delaySec,
      status: 'queued',
      summary: top ? top.title : 'Routine health summary: all nominal',
      overall: triage.overall,
      topRule: top?.ruleId,
      payload: signedIn ? packet : undefined,
    });
    setBusy(false);
  };

  const mine = packets.filter((p) => p.crewId === crewMember.id).slice().reverse();
  const others = packets.filter((p) => p.crewId !== crewMember.id).slice().reverse();

  return (
    <>
      <PageHeader
        eyebrow={`Comm delay ${formatDelay(delaySec)} one-way · round-trip ≥ ${roughDuration(delaySec * 2)}`}
        title="Ground Link"
        subtitle={
          signedIn
            ? 'Your check-ins and alerts reach the ground team automatically whenever there is a connection. Send to Ground adds a compressed health report; if you are offline it waits and is sent as soon as a link is back.'
            : "Nothing leaves this device until you tap Send to Ground. In this local mode the transmission is simulated with your mission's light-time delay, and the flight-surgeon reply is simulated too."
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Panel aria-labelledby="pk-h" data-tour="ground">
          <h2 id="pk-h" className="h2 mb-3 flex items-center gap-2">
            <Satellite className="h-5 w-5 text-accent" aria-hidden /> Health packet
          </h2>
          <ul className="mb-4 space-y-1.5 text-sm">
            <li className="flex justify-between">
              <span>Crew member</span>
              <span className="font-semibold">
                {crewMember.callsign} · {crewMember.name}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>Overall status</span>
              <StatusBadge level={triage.overall} size="sm" />
            </li>
            <li className="flex justify-between">
              <span>Alerts with reasoning</span>
              <span className="font-semibold">{triage.alerts.length}</span>
            </li>
            <li className="flex justify-between">
              <span>Indicator series (14 days)</span>
              <span className="font-semibold">{Object.keys(packet.series).length}</span>
            </li>
            <li className="flex justify-between">
              <span>Size</span>
              <span className="numeral">{size ? `${formatBytes(size.raw)} → ${formatBytes(size.gz)} gzip` : '…'}</span>
            </li>
            <li className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" aria-hidden /> Private journal notes
              </span>
              <span>excluded</span>
            </li>
          </ul>
          <button className="btn-primary btn-lg w-full" onClick={send} disabled={busy}>
            <Send className="h-5 w-5" aria-hidden /> Send to Ground
          </button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={async () => downloadBlob(await buildReportPdf(packet), `vitalis-report-${crewMember.callsign}-sol${day}.pdf`)}>
              <FileText className="h-4 w-4" aria-hidden /> PDF report
            </button>
            <button className="btn-ghost" onClick={() => downloadBlob(new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' }), `vitalis-packet-${crewMember.callsign}-sol${day}.json`)}>
              <FileJson className="h-4 w-4" aria-hidden /> JSON packet
            </button>
          </div>
          <p className="muted mt-4 text-xs">
            Demo time-warp ×{warp}: a {formatDelay(delaySec)} light-time takes {Math.round(delaySec / warp)} s here. The flight surgeon reply arrives after a return delay plus ~{SURGEON_THINK_SEC / 60} min of review. Change this in Settings.
          </p>
        </Panel>
        <section aria-labelledby="q-h">
          <Inbox />
          <h2 id="q-h" className="h2 mb-3 flex items-center gap-2">
            <Download className="h-5 w-5 text-accent" aria-hidden /> Transmissions
          </h2>
          {mine.length ? (
            <ul className="space-y-3">
              {mine.map((p) => (
                <PacketRow key={p.id} p={p} />
              ))}
            </ul>
          ) : (
            <p className="muted panel p-4 text-sm">No packets sent yet for {crewMember.callsign}.</p>
          )}
          {others.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-slate-300">Other crew transmissions ({others.length})</summary>
              <ul className="mt-3 space-y-3">
                {others.map((p) => (
                  <PacketRow key={p.id} p={p} />
                ))}
              </ul>
            </details>
          )}
          <p className={cn('mt-4 text-xs', LEVEL_META[triage.overall].text)}>{triage.overall !== 'nominal' && 'Remember: start the onboard checklist now. Do not wait for the reply.'}</p>
        </section>
      </div>
    </>
  );
}
