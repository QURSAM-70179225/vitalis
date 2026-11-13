import { useEffect } from 'react';
import { on } from '@/utils/bus';
import { useApp } from '@/store/useApp';
import { useMissionContext } from '@/hooks/useMission';
import { uid } from '@/utils';
import type { ChannelId, SharedAlert } from '@/types';
import { CHANNELS } from './channels';

export const LIVE_ACTIONS: Partial<Record<ChannelId, string[]>> = {
  suitPressure: ['Check suit integrity and the pressure gauge now', 'Switch to the emergency O₂ / purge mode per the EVA checklist', 'Return to the airlock immediately with your buddy'],
  suitCo2: ['Check the CO₂ scrubber (LiOH / RCA) status', 'Reduce workload and slow your breathing', 'Prepare to terminate the EVA if CO₂ keeps rising'],
  o2: ['Check O₂ consumables and the return time to the airlock', 'Begin the EVA termination if the margin is below the return time'],
  spo2: ['Stop exertion and breathe slowly', 'Re-seat the sensor and verify', 'Alert the CMO; give oxygen if SpO₂ stays below 92%'],
  hr: ['Stop exertion and rest', 'Verify with a second sensor', 'Alert the CMO if it persists for more than 5 minutes or with chest pain'],
  temp: ['Increase suit cooling (LCVG flow)', 'Reduce workload and hydrate', 'Recheck in 10 minutes'],
  resp: ['Stop and breathe slowly', 'Check suit CO₂'],
  doseRate: ['Move to the storm shelter now', 'Terminate any EVA', 'Log the dose every 30 minutes'],
  sys: ['Recheck seated after 5 minutes of rest', 'Alert the CMO if 180 or above'],
  dia: ['Recheck seated after 5 minutes of rest'],
};

/** Persists 1-minute sensor aggregates and turns live alarms into shared alerts. */
export function useDeviceEffects() {
  const { crewMember, day } = useMissionContext();
  // Sensors on this device always belong to the signed-in user (cloud) or the active crew member (local).
  const cloudUser = useApp((s) => (s.mission?.demo ? null : s.cloud.userId));
  const crewId = cloudUser ?? crewMember?.id;

  useEffect(() => {
    if (!crewId) return;
    const offSample = on('vitalSample', (e) => {
      void useApp.getState().addVitalSample({ id: uid('vs-'), crewId, ts: e.ts, channels: e.channels, sources: e.sources });
    });
    const offAlarm = on('liveAlarm', (e) => {
      const meta = CHANNELS[e.channel];
      const minute = Math.floor(e.at / 60000);
      const alert: SharedAlert = {
        id: `${crewId}:live:${e.channel}:${minute}`,
        crewId,
        day,
        level: e.level,
        ruleId: `live-${e.channel}`,
        title: `LIVE: ${meta.label} ${e.value.toFixed(meta.digits)} ${meta.unit}`,
        why: [`Sensor reading ${e.value.toFixed(meta.digits)} ${meta.unit} crossed the ${e.level === 'critical' ? 'emergency' : 'action'} limit and stayed there`],
        actions: LIVE_ACTIONS[e.channel] ?? ['Verify the sensor and recheck'],
        source: 'live',
        createdAt: new Date(e.at).toISOString(),
      };
      void useApp.getState().upsertSharedAlerts([alert]);
      useApp.getState().toast({ title: alert.title, body: alert.actions[0], level: e.level, action: { label: 'Live monitor', route: 'live' } });
    });
    return () => {
      offSample();
      offAlarm();
    };
  }, [crewId, day]);
}
