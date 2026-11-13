import type { CheckIn, CognitiveResult, CrewMember, IndicatorId, MissionEnvironment, StatusLevel, TriageResult } from '@/types';
import { buildSeries } from '@/engine/series';
import { SYSTEM_IDS } from '@/data/systems';

/**
 * Health packet sent to the ground. Contains vitals, triage output and cognitive
 * results for the last 14 days. Private journal notes are deliberately excluded.
 */
export interface HealthPacket {
  schema: 'vitalis.packet/1';
  generatedAt: string;
  mission: { name: string; environment: string; day: number; oneWayDelaySec: number };
  crew: { id: string; name: string; callsign: string; role: string };
  triage: {
    overall: StatusLevel;
    readiness: number;
    systems: Record<string, StatusLevel>;
    alerts: { level: StatusLevel; title: string; why: string[]; actions: string[] }[];
  };
  series: Partial<Record<IndicatorId, [number, number][]>>;
  symptoms: { day: number; symptoms: string[] }[];
  cognitive: { day: number; meanRt: number; lapses: number }[];
  crewNotes: { day: number; note: string }[];
}

export function buildPacket(p: {
  missionName: string;
  env: MissionEnvironment;
  day: number;
  delaySec: number;
  crew: CrewMember;
  triage: TriageResult;
  checkIns: CheckIn[];
  cognitive: CognitiveResult[];
}): HealthPacket {
  const from = p.day - 13;
  const recent = p.checkIns.filter((c) => c.day >= from);
  const s = buildSeries(recent, p.cognitive.filter((c) => c.day >= from));
  const series: HealthPacket['series'] = {};
  for (const [k, pts] of Object.entries(s) as [IndicatorId, { day: number; value: number }[]][]) series[k] = pts.map((x) => [x.day, x.value]);
  return {
    schema: 'vitalis.packet/1',
    generatedAt: new Date().toISOString(),
    mission: { name: p.missionName, environment: p.env.name, day: p.day, oneWayDelaySec: p.delaySec },
    crew: { id: p.crew.id, name: p.crew.name, callsign: p.crew.callsign, role: p.crew.role },
    triage: {
      overall: p.triage.overall,
      readiness: p.triage.readiness,
      systems: Object.fromEntries(SYSTEM_IDS.map((id) => [id, p.triage.systems[id].level])),
      alerts: p.triage.alerts.map((a) => ({ level: a.level, title: a.title, why: a.why, actions: a.actions })),
    },
    series,
    symptoms: recent.filter((c) => c.symptoms.length).map((c) => ({ day: c.day, symptoms: c.symptoms })),
    cognitive: p.cognitive.filter((c) => c.day >= from).map((c) => ({ day: c.day, meanRt: c.meanRt, lapses: c.lapses })),
    crewNotes: recent.filter((c) => c.notes).map((c) => ({ day: c.day, note: c.notes! })),
  };
}

/** Simulated flight-surgeon reply, keyed off the top alert. */
export function surgeonReply(packet: { overall: StatusLevel; summary: string }, callsign: string, topRule?: string): string {
  const sig = '\n\nFlight Surgeon, Mission Control';
  switch (topRule) {
    case 'sans-cluster':
      return `${callsign}, we reviewed your packet. We concur with the SANS / cardiovascular flag. Continue twice-daily BP and keep the Amsler log. CMO: please run OCT and fundoscopy at the next opportunity and downlink the images. Hold heavy resistive exercise and Valsalva until we review. Limit sodium and keep cabin ppCO₂ under 2.5 mmHg. Escalate immediately for any sudden vision loss or severe headache.${sig}`;
    case 'solar-particle-event':
      return `${callsign}, copy the radiation spike. Your shelter response is correct. Remain sheltered until the dose rate is under 2× background. Log symptoms and give a CBC at +72 h. Space weather shows the event peaking now.${sig}`;
    case 'behavioral-health':
      return `${callsign}, thank you for being open. BHP ops has booked a private psychological conference for your next comm window. We've asked the CDR to protect your sleep window and rebalance tasks this week. You're doing the right thing.${sig}`;
    case 'bone-loss-proxy':
      return `${callsign}, we see resistive loading below target and a mass decline. Please return to the full ARED protocol (we've uplinked an adjusted plan) and add 300 kcal/day. Next DXA-proxy review at the monthly exam.${sig}`;
    case 'possible-infection':
      return `${callsign}, copy the fever. Continue temperature every 4 h, rest and fluids. CMO may start the antipyretic per checklist. Mask in shared modules. Report if over 39.5 °C or lasting beyond 48 h.${sig}`;
    case 'cardiopulmonary-emergency':
      return `${callsign}, we received your emergency packet. Continue the onboard cardiac protocol. Your CMO is in the lead and we'll support every comm window. Downlink ECG strips as soon as possible.${sig}`;
    default:
      return packet.overall === 'nominal'
        ? `${callsign}, packet received. All nominal. Great consistency with your countermeasures. Keep it up!${sig}`
        : `${callsign}, packet received and reviewed. We agree with the onboard assessment (${packet.summary}). Continue the VITALIS guidance and send an update tomorrow.${sig}`;
  }
}
