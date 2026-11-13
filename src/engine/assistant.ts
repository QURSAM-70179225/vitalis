/**
 * Offline assistant: explains the astronaut's OWN data in plain language using the
 * triage engine's output. Guardrails: never diagnoses; every answer ends with the
 * current triage level and escalation path.
 */
import type { Alert, IndicatorId, SystemId, TriageResult } from '@/types';
import { INDICATORS } from '@/data/indicators';
import { SYSTEMS } from '@/data/systems';
import { LEVEL_META } from './status';
import { escalationPlan } from './escalation';
import type { Insight } from './insights';

export interface AssistantContext {
  triage: TriageResult;
  delaySec: number;
  callsign: string;
  insights: Insight[];
}

const TOPICS: { keys: RegExp; systems?: SystemId[]; indicators?: IndicatorId[]; guidance?: string }[] = [
  { keys: /heart|pulse|\bhr\b|cardio/i, systems: ['cardio'], indicators: ['heartRate'] },
  { keys: /blood pressure|\bbp\b|systolic|diastolic|pressure/i, systems: ['cardio', 'sans'], indicators: ['systolic', 'diastolic'] },
  { keys: /eye|vision|sans|see|blur|headache/i, systems: ['sans'] },
  { keys: /sleep|tired|fatigue|rest/i, systems: ['behavioral'], indicators: ['sleepHours', 'sleepQuality', 'fatigue'] },
  { keys: /mood|sad|stress|lonely|anxious|isolat|home/i, systems: ['behavioral'], indicators: ['mood', 'stress'] },
  { keys: /bone|muscle|exercise|mass|weight|ared|squat/i, systems: ['musculoskeletal'], indicators: ['exerciseResistive', 'bodyMass'] },
  { keys: /radiation|dose|solar|spe|shelter|dosimeter/i, indicators: ['radiationDose'] },
  { keys: /fever|temperature|infect|sick|cold|immune/i, systems: ['immune'], indicators: ['temperature'] },
  { keys: /oxygen|spo2|breath|lung|co2/i, systems: ['lungs'], indicators: ['spo2', 'respRate'] },
  { keys: /water|fluid|hydrat|kidney|drink/i, systems: ['gi'], indicators: ['hydration'] },
  { keys: /reaction|pvt|focus|cognit|slow/i, systems: ['behavioral'], indicators: ['reactionTime', 'pvtLapses'] },
];

const DIAGNOSIS = /\b(do i have|diagnos|is it cancer|cancer|am i (dying|sick)|what disease|prescri|which (drug|medication)|dose of)\b/i;
const URGENT = /\b(chest pain|can'?t breathe|cannot breathe|faint|passed out|suicid|kill myself|self.?harm|vision loss|seizure)\b/i;

export function footer(ctx: AssistantContext): string {
  const top = ctx.triage.alerts[0];
  const plan = escalationPlan(ctx.triage.overall, ctx.delaySec, top);
  return `\n\n— Triage level: ${LEVEL_META[ctx.triage.overall].emoji} ${LEVEL_META[ctx.triage.overall].label}. ${plan.contact}`;
}

function describeAlert(a: Alert): string {
  return `**${a.title}** (${LEVEL_META[a.level].label})\nWhy: ${a.why.join('; ')}.\nDo now: ${a.actions.slice(0, 3).map((x, i) => `${i + 1}) ${x}`).join(' ')}\nEscalate when: ${a.escalateWhen}`;
}

export function answerOffline(question: string, ctx: AssistantContext): string {
  const q = question.trim();
  const t = ctx.triage;

  if (URGENT.test(q)) {
    return `This sounds urgent. Stop what you're doing and alert your Crew Medical Officer and crew right now. Use Calm Mode (red shield, top right) for a step-by-step checklist. With a ${Math.round(ctx.delaySec / 60)}-minute delay to Earth, start onboard emergency procedures immediately. Don't wait for the ground.${footer(ctx)}`;
  }
  if (DIAGNOSIS.test(q)) {
    return `I can't diagnose conditions or recommend medication doses. That's for your CMO and flight surgeon. What I can do is explain what your data shows and what the protocols say.${t.alerts[0] ? `\n\nRight now the most important item is:\n${describeAlert(t.alerts[0])}` : ' Right now all your systems are nominal.'}${footer(ctx)}`;
  }

  const topic = TOPICS.find((x) => x.keys.test(q));
  if (topic) {
    const alerts = t.alerts.filter((a) => a.systems.some((s) => topic.systems?.includes(s)) || a.indicators.some((i) => topic.indicators?.includes(i)));
    const lines: string[] = [];
    for (const id of topic.indicators ?? []) {
      const a = t.indicators[id];
      if (!a) continue;
      const meta = INDICATORS[id];
      const base = a.baseline ? ` Your personal baseline is ${a.baseline.mean.toFixed(id === 'radiationDose' ? 2 : 0)} ${meta.unit}${a.pctFromBaseline !== null ? `, so you're ${Math.abs(a.pctFromBaseline).toFixed(0)}% ${a.pctFromBaseline >= 0 ? 'above' : 'below'} it` : ''}.` : '';
      lines.push(`• ${meta.label}: ${Number(a.value.toFixed(2))} ${meta.unit} → ${LEVEL_META[a.level].label}.${base}${a.reasons.length ? ` ${a.reasons[0]}.` : ''}`);
    }
    const sys = topic.systems?.[0];
    const intro = sys ? `${SYSTEMS[sys].name}: ${SYSTEMS[sys].spaceflightEffects}` : '';
    const ins = ctx.insights.find((i) => topic.indicators?.some((x) => i.indicators.includes(x)));
    return [
      intro,
      lines.length ? `Your latest readings:\n${lines.join('\n')}` : '',
      alerts.length ? `Active alert${alerts.length > 1 ? 's' : ''}:\n${alerts.map(describeAlert).join('\n\n')}` : 'No active alerts in this area. Keep up your countermeasures.',
      ins ? `Pattern in your data: ${ins.text}` : '',
    ]
      .filter(Boolean)
      .join('\n\n') + footer(ctx);
  }

  if (/what should i do|action|next|help|todo|to do/i.test(q)) {
    if (!t.alerts.length) return `Everything is nominal, ${ctx.callsign}. Keep your routine: morning check-in, resistive and aerobic blocks, 2+ L fluids and a protected sleep window.${footer(ctx)}`;
    return `Here's your priority list, most urgent first:\n\n${t.alerts.slice(0, 3).map(describeAlert).join('\n\n')}${footer(ctx)}`;
  }
  if (/ready|readiness|score/i.test(q)) {
    const flagged = Object.values(t.systems).filter((s) => s.level !== 'nominal');
    return `Your mission readiness is ${t.readiness}/100. It's 100 minus penalties for flagged body systems (${flagged.length ? flagged.map((s) => `${SYSTEMS[s.system].short}: ${LEVEL_META[s.level].label}`).join(', ') : 'none'}), missed check-ins, short sleep and low exercise adherence.${footer(ctx)}`;
  }
  if (/delay|ground|earth|surgeon|contact/i.test(q)) {
    const plan = escalationPlan(t.overall, ctx.delaySec, t.alerts[0]);
    return `${plan.headline}\n${plan.contact}\nYou can send a health packet from Ground Link. The flight surgeon will see it after the one-way delay.${footer(ctx)}`;
  }
  // Default: status summary
  return `Hi ${ctx.callsign}. Overall you're ${LEVEL_META[t.overall].label} with readiness ${t.readiness}/100. ${
    t.alerts.length ? `Top item: ${describeAlert(t.alerts[0])}` : 'No active alerts.'
  }\n\nAsk me about your heart, blood pressure, eyes, sleep, mood, bone, radiation, or "what should I do?".${footer(ctx)}`;
}

/** System prompt for the optional LLM layer. */
export function llmSystemPrompt(ctx: AssistantContext): string {
  const summary = {
    overall: ctx.triage.overall,
    readiness: ctx.triage.readiness,
    alerts: ctx.triage.alerts.map((a) => ({ level: a.level, title: a.title, why: a.why, actions: a.actions, escalateWhen: a.escalateWhen })),
    indicators: Object.values(ctx.triage.indicators).map((a) => a && { id: a.indicator, value: a.value, level: a.level, baseline: a.baseline?.mean, reasons: a.reasons }),
    oneWayCommDelaySec: ctx.delaySec,
    insights: ctx.insights.map((i) => i.text),
  };
  return [
    'You are VITALIS, an onboard health assistant for astronauts on a deep-space mission.',
    "Explain the astronaut's OWN data in plain, calm, non-technical language (max ~150 words).",
    'Use ONLY the rule-engine output below. Never invent readings.',
    'NEVER diagnose a disease and NEVER recommend medication doses. For those, refer to the Crew Medical Officer / flight surgeon.',
    'Always point to the triage level and the escalation path. If anything sounds urgent, tell them to alert the CMO immediately and use Calm Mode.',
    `Rule-engine output (JSON): ${JSON.stringify(summary)}`,
  ].join('\n');
}
