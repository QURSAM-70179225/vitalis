import { useEffect } from 'react';
import { useApp } from '@/store/useApp';
import type { GroundPacket } from '@/types';
import { surgeonReply } from './packet';

/** Real milliseconds for a simulated duration, given the demo time-warp. */
export function warpMs(simSec: number, warp: number): number {
  return (simSec * 1000) / Math.max(1, warp);
}

/** Flight-surgeon "think time" before a reply, simulated seconds. */
export const SURGEON_THINK_SEC = 180;

export function packetTimeline(p: GroundPacket, warp: number) {
  const sent = p.sentAt ? new Date(p.sentAt).getTime() : Date.now();
  const deliverAt = sent + warpMs(p.delaySec, warp);
  const replyAt = deliverAt + warpMs(p.delaySec + SURGEON_THINK_SEC, warp);
  return { sent, deliverAt, replyAt };
}

/**
 * Advances queued packets: transmitting → delivered (after one-way delay) →
 * replied (after think-time + return delay). Timestamp-based, so it survives reloads.
 */
export function useGroundLinkSimulator(): void {
  useEffect(() => {
    const tick = () => {
      const { packets, settings, upsertPacket, toast, updateMission, crew, cloud, mission } = useApp.getState();
      // With a real cloud link, packets are uploaded by the sync engine and replies come from real people.
      if (cloud.userId && mission && !mission.demo) return;
      const now = Date.now();
      for (const p of packets) {
        if (p.status === 'replied') continue;
        const { deliverAt, replyAt } = packetTimeline(p, settings.timeWarp);
        if (p.status === 'queued') {
          void upsertPacket({ ...p, status: 'transmitting', sentAt: new Date().toISOString() });
        } else if (p.status === 'transmitting' && now >= deliverAt) {
          void upsertPacket({ ...p, status: 'delivered', deliveredAt: new Date(deliverAt).toISOString() });
          void updateMission({ lastGroundSync: new Date(deliverAt).toISOString() });
          toast({ title: 'Health packet delivered to Mission Control', body: 'Flight surgeon review in progress', level: 'info', action: { label: 'Ground Link', route: 'ground' } });
        } else if (p.status === 'delivered' && now >= replyAt) {
          const c = crew.find((x) => x.id === p.crewId);
          void upsertPacket({ ...p, status: 'replied', replyAt: new Date(replyAt).toISOString(), reply: p.reply ?? surgeonReply(p, c?.callsign ?? 'Crew', p.topRule) });
          toast({ title: '📡 Flight surgeon reply received', body: p.summary, level: 'info', action: { label: 'Read reply', route: 'ground' } });
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
}
