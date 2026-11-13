/**
 * Mission routine generator. The base routine adapts to the triage result,
 * e.g. BP checks twice daily while cardio/SANS is flagged.
 */
import type { Alert, TriageResult } from '@/types';
import { rank } from './status';

export type TaskKind = 'vitals' | 'exercise' | 'mood' | 'mass' | 'exam' | 'cognitive' | 'adaptive' | 'meal' | 'sleep';

export interface ScheduledTask {
  id: string;
  time: string; // HH:MM, mission elapsed clock (GMT on ISS)
  title: string;
  detail: string;
  kind: TaskKind;
  minutes: number;
  route?: string;
  adaptive?: boolean;
  reason?: string;
}

export function buildSchedule(day: number, triage: TriageResult | null): ScheduledTask[] {
  const t: ScheduledTask[] = [
    { id: 'wake-vitals', time: '07:00', title: 'Morning vitals & check-in', detail: 'Resting HR, BP, SpO₂, temperature, sleep log', kind: 'vitals', minutes: 3, route: 'checkin' },
    { id: 'breakfast', time: '07:30', title: 'Breakfast + 500 mL fluids', detail: 'Log fluids in the evening check', kind: 'meal', minutes: 30 },
    { id: 'exercise-resistive', time: '10:00', title: 'Resistive exercise block', detail: 'Squat, deadlift, heel raise: 45 min', kind: 'exercise', minutes: 60, route: 'guidance:resistive' },
    { id: 'exercise-aerobic', time: '15:30', title: 'Aerobic exercise block', detail: 'Treadmill (harness) or cycle: 30–45 min', kind: 'exercise', minutes: 45, route: 'guidance:aerobic' },
    { id: 'evening-mood', time: '20:30', title: 'Evening mood & journal', detail: 'Mood, stress, private note, wellbeing check', kind: 'mood', minutes: 3, route: 'cognitive' },
    { id: 'pre-sleep', time: '21:30', title: 'Pre-sleep lighting mode', detail: 'Dim, warm light. No screens after 22:30.', kind: 'sleep', minutes: 60, route: 'guidance:sleep-hygiene' },
  ];
  if (day % 3 === 0) t.push({ id: 'pvt', time: '13:00', title: 'Reaction Time Test (PVT)', detail: '2-minute vigilance test', kind: 'cognitive', minutes: 2, route: 'cognitive' });
  if (day % 7 === 0) t.push({ id: 'mass', time: '07:15', title: 'Weekly body mass (SLAMMD)', detail: '3 readings, same time of day', kind: 'mass', minutes: 10, route: 'checkin' });
  if (day % 30 === 0) t.push({ id: 'exam', time: '14:00', title: 'Monthly in-depth medical exam', detail: 'Eye exam (OCT/fundoscopy), ultrasound, blood draw with the CMO', kind: 'exam', minutes: 90 });

  if (triage) {
    const add = (task: ScheduledTask) => {
      if (!t.some((x) => x.id === task.id)) t.push({ ...task, adaptive: true });
    };
    const has = (pred: (a: Alert) => boolean) => triage.alerts.some(pred);
    if (rank(triage.systems.cardio.level) >= 1 || rank(triage.systems.sans.level) >= 1)
      add({ id: 'bp-evening', time: '19:00', title: 'Extra BP check (twice daily while flagged)', detail: 'Seated, arm at heart level', kind: 'adaptive', minutes: 5, route: 'checkin', reason: 'Cardiovascular / SANS status is elevated' });
    if (has((a) => a.ruleId === 'sans-cluster'))
      add({ id: 'amsler', time: '12:00', title: 'Amsler grid + near-vision test', detail: 'Log results in the eye section', kind: 'adaptive', minutes: 5, route: 'guidance:sans-check', reason: 'SANS cluster detected' });
    if (has((a) => a.ruleId === 'behavioral-health'))
      add({ id: 'breathing', time: '16:30', title: '4-7-8 breathing + call home', detail: 'Private family conference slot', kind: 'adaptive', minutes: 15, route: 'cognitive', reason: 'Behavioral health pattern' });
    if (has((a) => a.ruleId === 'sleep-debt' || a.ruleId === 'behavioral-health'))
      add({ id: 'sleep-protect', time: '21:00', title: 'Protected 8.5 h sleep window', detail: 'Ask the crew to cover late tasks', kind: 'adaptive', minutes: 510, reason: 'Sleep debt' });
    if (has((a) => a.ruleId === 'possible-infection'))
      add({ id: 'temp-recheck', time: '11:00', title: 'Temperature recheck (every 4 h)', detail: 'Also 15:00 and 19:00', kind: 'adaptive', minutes: 2, route: 'checkin', reason: 'Possible infection' });
    if (has((a) => a.ruleId === 'solar-particle-event'))
      add({ id: 'spe-dose', time: '08:00', title: 'Dosimeter log every 30 min (SPE)', detail: 'Remain in the storm shelter until all-clear', kind: 'adaptive', minutes: 1, route: 'guidance:radiation-shelter', reason: 'Radiation spike' });
    if (has((a) => a.ruleId === 'bone-loss-proxy'))
      add({ id: 'bone-extra', time: '17:30', title: 'Make-up resistive session', detail: '20 min high-load: heel raises + squats', kind: 'adaptive', minutes: 20, route: 'guidance:resistive', reason: 'Bone loading below target' });
    if (has((a) => a.ruleId === 'renal-stone-risk'))
      add({ id: 'fluids', time: '09:00', title: 'Hourly fluid reminder', detail: 'One 250 mL bag every hour while awake', kind: 'adaptive', minutes: 1, reason: 'Low fluid intake' });
  }
  return t.sort((a, b) => a.time.localeCompare(b.time));
}
