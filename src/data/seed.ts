/**
 * Demo-mode generator: 90 days × 4 crew on a Mars Transit mission, deterministic
 * (seeded PRNG) so judges always see the same story.
 *
 * Scripted story:
 *  - Day 12–15  Kenji: upper-respiratory illness (fever, congestion)
 *  - Day 18–25  Lena: sleep-deficit week (≈5 h/night, slower reaction time)
 *  - Day 33     Contingency EVA (Lena + Viktor)
 *  - Day 35→90  Viktor: resistive-exercise adherence falls, body mass declines (bone-loss proxy)
 *  - Day 42     Solar particle event: dose spike for the whole crew → shelter protocol
 *               RADIATION IS REAL NASA DATA: every day's dose comes from Curiosity's RAD instrument
 *               on its cruise to Mars (day 1 = 27 Jan 2012, day 42 = 8 Mar 2012 solar storm).
 *               See src/data/nasa/ and data/nasa/README.md.
 *  - Day 45–62  Amara: mood decline (isolation) → intervention day 58 → recovery
 *  - Day 76→90  Lena: rising BP, then headache, then vision change → SANS alert today
 */
import { realRadiationForDay } from './nasa/radiationTimeline';
import type {
  CheckIn,
  CognitiveResult,
  CrewMember,
  GroundPacket,
  IndicatorValues,
  JournalEntry,
  Mission,
  MissionEvent,
  SymptomId,
} from '@/types';
import { ENVIRONMENTS } from './environments';
import { wellbeingScore } from '@/engine/pvt';

export const DEMO_DAYS = 90;

export const DEMO_CREW: CrewMember[] = [
  { id: 'c1', name: 'Lena Ortiz', callsign: 'ORION', role: 'Commander', age: 44, color: '#22d3ee' },
  { id: 'c2', name: 'Kenji Mori', callsign: 'SAGE', role: 'Crew Medical Officer', age: 49, color: '#a78bfa' },
  { id: 'c3', name: 'Amara Diallo', callsign: 'NOVA', role: 'Mission Specialist · Geology', age: 36, color: '#f472b6' },
  { id: 'c4', name: 'Viktor Halvorsen', callsign: 'ATLAS', role: 'Pilot · Flight Engineer', age: 41, color: '#facc15' },
];

/** mulberry32 — tiny deterministic PRNG. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

interface Profile {
  hr: number;
  sys: number;
  dia: number;
  mass: number;
  glucose: number;
  temp: number;
  rt: number;
}

const PROFILES: Record<string, Profile> = {
  c1: { hr: 58, sys: 114, dia: 72, mass: 63.5, glucose: 86, temp: 36.8, rt: 252 },
  c2: { hr: 63, sys: 120, dia: 77, mass: 78.2, glucose: 92, temp: 36.7, rt: 268 },
  c3: { hr: 61, sys: 108, dia: 68, mass: 58.9, glucose: 84, temp: 36.9, rt: 247 },
  c4: { hr: 56, sys: 118, dia: 75, mass: 82.4, glucose: 89, temp: 36.7, rt: 258 },
};

const JOURNAL_NOTES: Record<string, string[]> = {
  good: [
    'Watched Earth shrink a little more today. Strange and beautiful.',
    'Good team dinner. Viktor\'s rehydrated tacos were a hit.',
    'Finished the geology review early. Feeling productive.',
    'Sent a video to my family. Their reply made my week.',
    'Solid workout, slept well. Feeling like myself.',
  ],
  low: [
    'Hard to focus. Missing home more than I expected.',
    'Everything feels the same every day. The module is small.',
    'Didn\'t sleep much. Too much on my mind.',
    'Skipped the crew movie night. Needed space.',
  ],
  recovering: [
    'Talked with the psych team today. It helped more than I thought.',
    'New schedule is working. Tried the breathing exercise twice.',
    'Called home. Laughed for the first time in a while.',
  ],
};

export interface DemoData {
  mission: Mission;
  crew: CrewMember[];
  checkIns: CheckIn[];
  cognitive: CognitiveResult[];
  journal: JournalEntry[];
  events: MissionEvent[];
  packets: GroundPacket[];
}

export function generateDemoData(now: Date = new Date()): DemoData {
  const rand = prng(20261007);
  const n = () => gaussian(rand);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (DEMO_DAYS - 1));
  const ts = (day: number, h: number, m = 0) => {
    const d = new Date(start);
    d.setDate(d.getDate() + day - 1);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const checkIns: CheckIn[] = [];
  const cognitive: CognitiveResult[] = [];
  const journal: JournalEntry[] = [];

  for (const crew of DEMO_CREW) {
    const p = PROFILES[crew.id];
    for (let day = 1; day <= DEMO_DAYS; day++) {
      // Occasional missed check-in (never in the final week).
      if (day < DEMO_DAYS - 7 && rand() < 0.03) continue;

      let hr = p.hr + n() * 2.2;
      let sys = p.sys + n() * 3;
      let dia = p.dia + n() * 2.2;
      let temp = p.temp + n() * 0.12;
      let sleep = 7.5 + n() * 0.4;
      let sleepQ = 4 + n() * 0.6;
      let mood = 4.1 + n() * 0.55;
      let stress = 2 + n() * 0.6;
      let fatigue = 2 + n() * 0.6;
      let hydration = 2350 + n() * 220;
      let resistive = 47 + n() * 6;
      let aerobic = 36 + n() * 6;
      let rr = 14 + n() * 1.1;
      const spo2 = 98 + n() * 0.6;
      // Real NASA Curiosity RAD measurement for this mission day; ±4 % per person for where they sit in the ship.
      const real = realRadiationForDay(day);
      let dose = (real?.doseMsv ?? 1.84) * (1 + n() * 0.04);
      const symptoms: SymptomId[] = [];

      // Weekly rest day for exercise.
      if (day % 7 === 0) {
        resistive = 0;
        aerobic = 20 + n() * 5;
      }

      // Early-mission adaptation: congestion / back pain from fluid shift + spine lengthening.
      if (day <= 6 && rand() < 0.45) symptoms.push('congestion');
      if (day <= 8 && rand() < 0.35) symptoms.push('backPain');
      if (day <= 3 && rand() < 0.5) symptoms.push('nausea');

      // Day 42: the real 8 Mar 2012 solar particle event is in the dose above; the crew's sleep and stress react.
      if (day === 42) {
        stress += 1.4;
        sleep -= 1.2;
      }

      // Contingency EVA day 33.
      if (day === 33 && (crew.id === 'c1' || crew.id === 'c4')) {
        fatigue += 1.5;
        symptoms.push('muscleCramps');
        dose += 0.4;
      }

      if (crew.id === 'c1') {
        // Sleep-deficit week.
        if (day >= 18 && day <= 25) {
          sleep = 5.1 + n() * 0.35;
          sleepQ = 2.4 + n() * 0.5;
          fatigue = 3.9 + n() * 0.4;
          stress = 3.2 + n() * 0.4;
          mood = 3.3 + n() * 0.4;
          hr += 4;
          if (rand() < 0.4) symptoms.push('insomnia');
        }
        // SANS build-up from day 76.
        if (day >= 76) {
          const k = day - 75;
          sys = p.sys + k * 1.25 + n() * 1.6;
          dia = p.dia + k * 0.55 + n() * 1.2;
          if (day >= 84 && (day >= 87 || rand() < 0.5)) symptoms.push('headache');
          if (day >= 88) symptoms.push('visionChange');
        }
      }

      if (crew.id === 'c2' && day >= 12 && day <= 15) {
        temp = 37.9 + (day === 13 ? 0.4 : 0.1) + n() * 0.1;
        hr += 9;
        rr += 3;
        fatigue = 4.2;
        sleepQ = 2.5;
        symptoms.push('congestion', 'fever');
        if (day === 13) symptoms.push('headache');
      }

      if (crew.id === 'c3') {
        if (day >= 45 && day <= 60) {
          const depth = Math.min(1, (day - 44) / 6);
          mood = 4.1 - 2.2 * depth + n() * 0.35;
          stress = 2 + 2.2 * depth + n() * 0.35;
          sleep = 7.4 - 1.4 * depth + n() * 0.3;
          sleepQ = 4 - 2 * depth + n() * 0.4;
          fatigue = 2 + 1.6 * depth + n() * 0.4;
          if (rand() < 0.4) symptoms.push('insomnia');
        } else if (day > 60 && day <= 68) {
          const rec = (day - 60) / 8;
          mood = 2.2 + 1.9 * rec + n() * 0.35;
          stress = 4 - 2 * rec + n() * 0.35;
          sleep = 6.2 + 1.2 * rec + n() * 0.3;
          sleepQ = 2.4 + 1.6 * rec + n() * 0.4;
        }
      }

      let mass = p.mass + n() * 0.15;
      if (crew.id === 'c4') {
        if (day >= 35) {
          const k = Math.min(1, (day - 35) / 25);
          if (day % 7 !== 0) resistive = 46 - 26 * k + n() * 4;
          aerobic -= 6 * k;
          mass = p.mass * (1 - 0.036 * Math.min(1, (day - 35) / 55)) + n() * 0.15;
          if (rand() < 0.15) symptoms.push('backPain');
        }
        if (day >= 86) hydration = 1650 + n() * 120;
      }

      const values: IndicatorValues = {
        heartRate: Math.round(hr),
        systolic: Math.round(sys),
        diastolic: Math.round(dia),
        spo2: Math.round(clamp(spo2, 93, 100)),
        temperature: r1(temp),
        glucose: Math.round(p.glucose + n() * 4.5),
        respRate: Math.round(clamp(rr, 10, 30)),
        sleepHours: Math.round(clamp(sleep, 3, 10) * 4) / 4,
        sleepQuality: Math.round(clamp(sleepQ, 1, 5)),
        mood: Math.round(clamp(mood, 1, 5)),
        stress: Math.round(clamp(stress, 1, 5)),
        fatigue: Math.round(clamp(fatigue, 1, 5)),
        hydration: Math.round(clamp(hydration, 800, 4000) / 50) * 50,
        exerciseResistive: Math.max(0, Math.round(resistive / 5) * 5),
        exerciseAerobic: Math.max(0, Math.round(aerobic / 5) * 5),
        radiationDose: r2(Math.max(0.5, dose)),
      };
      if (day === 1 || day % 7 === 1 || (day <= 7 && day % 2 === 1)) values.bodyMass = r1(mass);
      if (day === DEMO_DAYS) values.bodyMass = r1(mass);

      checkIns.push({
        id: `${crew.id}-d${day}`,
        crewId: crew.id,
        day,
        timestamp: ts(day, 7, Math.floor(rand() * 30)),
        values,
        symptoms: [...new Set(symptoms)],
        source: 'seed',
      });

      // PVT every 3rd day (daily during Lena's deficit week).
      const pvtToday = day % 3 === 0 || (crew.id === 'c1' && day >= 18 && day <= 25) || day === DEMO_DAYS;
      if (pvtToday) {
        const s = values.sleepHours ?? 7.5;
        const f = values.fatigue ?? 2;
        const meanRt = Math.round(p.rt + Math.max(0, 7 - s) * 30 + (f - 2) * 7 + n() * 9);
        const lapses = Math.max(0, Math.round((meanRt - p.rt) / 18 + n() * 0.8));
        cognitive.push({
          id: `${crew.id}-pvt${day}`,
          crewId: crew.id,
          day,
          timestamp: ts(day, 13, 10),
          meanRt,
          medianRt: meanRt - Math.round(8 + rand() * 6),
          lapses,
          falseStarts: rand() < 0.2 ? 1 : 0,
          trials: 22 + Math.floor(rand() * 6),
        });
      }

      // Journal every ~4 days.
      if (day % 4 === crew.id.charCodeAt(1) % 4) {
        const m = values.mood ?? 4;
        const bucket = crew.id === 'c3' && day > 58 && day <= 70 ? 'recovering' : m <= 2 ? 'low' : 'good';
        const notes = JOURNAL_NOTES[bucket];
        const answers = [m, 6 - (values.stress ?? 2), values.sleepQuality ?? 4, m >= 3 ? 4 : 2, bucket === 'low' ? 2 : 4];
        journal.push({
          id: `${crew.id}-j${day}`,
          crewId: crew.id,
          day,
          timestamp: ts(day, 20, 45),
          mood: m,
          note: notes[Math.floor(rand() * notes.length)],
          wellbeing: wellbeingScore(answers),
          answers,
          connectedHome: bucket !== 'low' && rand() < 0.6,
        });
      }
    }
  }

  const events: MissionEvent[] = [
    { id: 'e-launch', day: 1, type: 'other', label: 'Trans-Mars injection', crewIds: [] },
    { id: 'e-ill', day: 12, type: 'illness', label: 'Upper respiratory infection (Kenji)', crewIds: ['c2'] },
    { id: 'e-sleep', day: 18, type: 'other', label: 'High-workload week: thruster anomaly', crewIds: ['c1'] },
    { id: 'e-eva', day: 33, type: 'eva', label: 'Contingency EVA: antenna repair', crewIds: ['c1', 'c4'] },
    { id: 'e-spe', day: 42, type: 'spe', label: 'Solar storm (real NASA data: 8 Mar 2012)', crewIds: [] },
    { id: 'e-int', day: 58, type: 'intervention', label: 'Behavioral support: PFC + workload rebalanced (Amara)', crewIds: ['c3'] },
    { id: 'e-sans', day: 88, type: 'illness', label: 'Vision change reported (Lena)', crewIds: ['c1'] },
  ];

  const env = ENVIRONMENTS['mars-transit'];
  const packets: GroundPacket[] = [
    {
      id: 'pkt-seed-1',
      crewId: 'c1',
      createdAt: ts(42, 9, 5),
      day: 42,
      rawBytes: 48211,
      compressedBytes: 9120,
      delaySec: 380,
      status: 'replied',
      sentAt: ts(42, 9, 5),
      deliveredAt: ts(42, 9, 11),
      replyAt: ts(42, 9, 31),
      reply:
        'Flight Surgeon: Copy the SPE. Your shelter response was textbook. Stay sheltered until the dose rate drops below 2× background. Log CBC at day 45. Good work, crew.',
      summary: 'SPE dose spike, crew sheltered',
      overall: 'critical',
    },
    {
      id: 'pkt-seed-2',
      crewId: 'c3',
      createdAt: ts(57, 18, 0),
      day: 57,
      rawBytes: 51870,
      compressedBytes: 9842,
      delaySec: 450,
      status: 'replied',
      sentAt: ts(57, 18, 0),
      deliveredAt: ts(57, 18, 8),
      replyAt: ts(58, 7, 30),
      reply:
        'BHP Ops: Thanks for flagging, Amara. We have booked a private psychological conference for tomorrow and rebalanced the task list with the CDR. You are not alone in this.',
      summary: 'Behavioral health pattern, 5 days',
      overall: 'act',
    },
  ];
  void env;

  const mission: Mission = {
    id: 'mission',
    name: 'ARES-1 · Mars Transit',
    environmentId: 'mars-transit',
    startDate: start.toISOString(),
    activeCrewId: 'c1',
    lastGroundSync: ts(89, 18, 20),
    demo: true,
  };

  return { mission, crew: DEMO_CREW, checkIns, cognitive, journal, events, packets };
}
