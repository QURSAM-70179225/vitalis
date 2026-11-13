import type { HazardId, IndicatorId, SymptomId, SystemId } from '@/types';

export interface SystemInfo {
  id: SystemId;
  name: string;
  short: string;
  whatItDoes: string;
  spaceflightEffects: string;
  hazards: HazardId[];
  indicators: IndicatorId[];
  symptoms: SymptomId[];
  guidanceIds: string[];
  escalateWhen: string;
  /** NASA HRP risk this maps to (Human Research Roadmap). */
  hrpRisk: string;
}

export const SYSTEMS: Record<SystemId, SystemInfo> = {
  cardio: {
    id: 'cardio',
    name: 'Cardiovascular',
    short: 'Heart',
    whatItDoes: 'Your heart and blood vessels move oxygen and nutrients around your body.',
    spaceflightEffects:
      'In weightlessness, fluid shifts toward your head and the heart works less against gravity. Over time it can shrink slightly, and on landing you may feel dizzy when standing (orthostatic intolerance). Radiation may add long-term heart disease risk.',
    hazards: ['gravity', 'radiation'],
    indicators: ['heartRate', 'systolic', 'diastolic'],
    symptoms: ['chestPain', 'dizziness', 'shortnessOfBreath'],
    guidanceIds: ['aerobic', 'hydration', 'orthostatic', 'bp-recheck'],
    escalateWhen:
      'Chest pain, fainting, resting HR above 130 or below 40, or BP at or above 180/120. Contact flight surgeon immediately.',
    hrpRisk: 'Risk of Cardiovascular Adaptations Contributing to Adverse Mission Performance and Health Outcomes',
  },
  musculoskeletal: {
    id: 'musculoskeletal',
    name: 'Musculoskeletal & Bone',
    short: 'Bone/Muscle',
    whatItDoes: 'Bones and muscles hold you up, protect your organs and let you move and work.',
    spaceflightEffects:
      'Without loading, weight-bearing bones like your hips and spine can lose about 1–1.5% of their mineral density per month, and leg and back muscles weaken. Back pain is common as the spine lengthens.',
    hazards: ['gravity'],
    indicators: ['bodyMass', 'exerciseResistive', 'exerciseAerobic'],
    symptoms: ['backPain', 'muscleCramps'],
    guidanceIds: ['resistive', 'aerobic', 'nutrition-bone', 'back-pain'],
    escalateWhen:
      'Sudden severe back or flank pain (possible kidney stone), suspected fracture, or body mass loss over 5%.',
    hrpRisk: 'Risk of Early Onset Osteoporosis Due to Spaceflight; Risk of Impaired Performance Due to Reduced Muscle Mass',
  },
  sans: {
    id: 'sans',
    name: 'Eyes & Brain (SANS)',
    short: 'Eyes/Brain',
    whatItDoes: 'Your eyes and brain take in and process what you see and control your body.',
    spaceflightEffects:
      'Spaceflight-Associated Neuro-ocular Syndrome (SANS): the headward fluid shift can swell the optic disc and flatten the back of the eye, causing blurry near vision. Headaches and higher CO₂ may be related.',
    hazards: ['gravity', 'environment'],
    indicators: ['systolic'],
    symptoms: ['headache', 'visionChange'],
    guidanceIds: ['sans-check', 'co2', 'bp-recheck'],
    escalateWhen:
      'New or worsening vision change, especially with headache — schedule an eye exam (fundoscopy/OCT) and contact the flight surgeon.',
    hrpRisk: 'Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)',
  },
  immune: {
    id: 'immune',
    name: 'Immune System',
    short: 'Immune',
    whatItDoes: 'Your immune system fights infections and repairs damage.',
    spaceflightEffects:
      'Stress, poor sleep, radiation and closed-loop microbes can weaken immunity. Dormant viruses (like those causing cold sores or shingles) can reactivate.',
    hazards: ['radiation', 'environment', 'isolation'],
    indicators: ['temperature', 'respRate'],
    symptoms: ['fever', 'congestion', 'skinRash'],
    guidanceIds: ['infection', 'sleep-hygiene', 'hydration'],
    escalateWhen: 'Temperature at or above 39.5 °C, fever lasting more than 48 h, or breathing difficulty.',
    hrpRisk: 'Risk of Adverse Health Event Due to Altered Immune Response',
  },
  behavioral: {
    id: 'behavioral',
    name: 'Behavioral Health & Nervous System',
    short: 'Behavioral',
    whatItDoes: 'Mood, sleep, stress and thinking speed decide how safely you can work.',
    spaceflightEffects:
      'Isolation, confinement, distance from family, workload and disrupted light cycles can lower mood, cause sleep loss and slow reaction time.',
    hazards: ['isolation', 'distance'],
    indicators: ['mood', 'stress', 'fatigue', 'sleepHours', 'sleepQuality', 'reactionTime', 'pvtLapses'],
    symptoms: ['insomnia'],
    guidanceIds: ['sleep-hygiene', 'breathing', 'connect-home', 'workload'],
    escalateWhen:
      'Thoughts of self-harm, inability to perform critical tasks, or low mood for more than a week. Talk to your CMO and request a private psychological conference.',
    hrpRisk: 'Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders',
  },
  gi: {
    id: 'gi',
    name: 'GI & Nutrition',
    short: 'GI/Nutrition',
    whatItDoes: 'Digestion turns food and water into energy and building blocks for your body.',
    spaceflightEffects:
      'Appetite often drops in space, leading to weight loss. Space motion sickness causes nausea early in a mission or after gravity changes. Low fluid intake raises kidney stone risk.',
    hazards: ['gravity', 'distance'],
    indicators: ['glucose', 'hydration', 'bodyMass'],
    symptoms: ['nausea'],
    guidanceIds: ['nutrition-bone', 'hydration', 'motion-sickness'],
    escalateWhen: 'Vomiting for more than 24 h, signs of dehydration, or glucose below 54 or above 250 mg/dL.',
    hrpRisk: 'Risk of Performance Decrement and Crew Illness Due to Inadequate Food and Nutrition',
  },
  skin: {
    id: 'skin',
    name: 'Skin',
    short: 'Skin',
    whatItDoes: 'Your skin is a barrier against microbes, dust and injury.',
    spaceflightEffects:
      'Skin gets thinner and heals more slowly. Dry cabin air, abrasive dust and EVA suit contact cause rashes and hot spots.',
    hazards: ['environment', 'radiation'],
    indicators: [],
    symptoms: ['skinRash'],
    guidanceIds: ['skin-care', 'infection'],
    escalateWhen: 'Spreading redness, warmth or pus (possible infection), or a blistering rash.',
    hrpRisk: 'Risk of Adverse Health Event Due to Altered Immune Response (dermatologic manifestations)',
  },
  lungs: {
    id: 'lungs',
    name: 'Lungs & Respiratory',
    short: 'Lungs',
    whatItDoes: 'Your lungs bring in oxygen and remove CO₂.',
    spaceflightEffects:
      'Cabin CO₂ is higher than on Earth, which can cause headaches. Lunar and Martian dust is fine and sharp and may irritate airways.',
    hazards: ['environment'],
    indicators: ['spo2', 'respRate'],
    symptoms: ['shortnessOfBreath', 'congestion'],
    guidanceIds: ['co2', 'breathing', 'infection'],
    escalateWhen: 'SpO₂ below 88%, breathing rate at or above 30, or worsening shortness of breath.',
    hrpRisk: 'Risk of Adverse Health and Performance Effects of Celestial Dust Exposure',
  },
};

export const SYSTEM_LIST = Object.values(SYSTEMS);
export const SYSTEM_IDS = Object.keys(SYSTEMS) as SystemId[];
