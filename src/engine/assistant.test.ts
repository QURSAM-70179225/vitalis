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
    expect(a).toMatch(/Triage level: .*Contact Flight Surgeon/);
  });
  it('treats urgent phrases as emergencies', () => {
    expect(answerOffline('I have chest pain', ctx)).toMatch(/alert your Crew Medical Officer/);
  });
  it('explains a topic from the engine output', () => {
    const a = answerOffline('why is my blood pressure flagged?', ctx);
    expect(a).toMatch(/Blood pressure — systolic: 13\d mmHg/);
    expect(a).toMatch(/SANS/);
    expect(a).toMatch(/Triage level/);
  });
  it('gives a priority list', () => {
    expect(answerOffline('what should I do?', ctx)).toMatch(/priority list/);
  });
});
