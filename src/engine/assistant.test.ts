import { describe, expect, it } from 'vitest';
import { answerOffline, type AssistantContext } from './assistant';
import { evaluate } from './triage';
import { generateDemoData } from '@/data/seed';
import { ENVIRONMENTS } from '@/data/environments';

const demo = generateDemoData(new Date('2026-11-07T12:00:00Z'));
const ctx: AssistantContext = {
  triage: evaluate({ crewId: 'c1', checkIns: demo.checkIns, cognitive: demo.cognitive, environment: ENVIRONMENTS['mars-transit'] }),
  delaySec: 720,
  callsign: 'ORION',
  insights: [],
};

describe('offline assistant guardrails', () => {
  it('never diagnoses and always points to triage + escalation', () => {
    const a = answerOffline('Do I have glaucoma?', ctx);
    expect(a).toMatch(/can't diagnose/);
    expect(a).toMatch(/Triage level: .*Get medical help now/);
  });
  it('treats urgent phrases as emergencies', () => {
    expect(answerOffline('I have chest pain', ctx)).toMatch(/alert your Crew Medical Officer/);
  });
  it('explains a topic from the engine output', () => {
    const a = answerOffline('why is my blood pressure flagged?', ctx);
    expect(a).toMatch(/Blood pressure \(top number\): 13\d mmHg/);
    expect(a).toMatch(/Eye and head pressure/);
    expect(a).toMatch(/Triage level/);
  });
  it('gives a priority list', () => {
    expect(answerOffline('what should I do?', ctx)).toMatch(/priority list/);
  });
});

describe('daily summary', () => {
  it('opens with today, the readings and what to do, in plain words', async () => {
    const { dailySummary } = await import('./assistant');
    const s = dailySummary(ctx);
    expect(s).toMatch(/ORION, something important needs attention/);
    expect(s).toMatch(/Today's readings/);
    expect(s).toMatch(/Blood pressure \(top number\)/);
    expect(s).toMatch(/What to do today/);
  });
  it('answers how the body is changing over time', () => {
    const a = answerOffline('How am I changing over time?', { ...ctx, changes: [{ indicator: 'bodyMass', label: 'Body weight', unit: 'kg', start: 64, end: 62, pct: -3, verdict: 'watch', headline: 'Body weight: down 3%', why: 'Less muscle work in space.' }] });
    expect(a).toMatch(/Body weight: down 3%/);
    expect(a).toMatch(/Triage level/);
  });
});
