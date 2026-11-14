/**
 * Core domain types for VITALIS. All values are stored in canonical metric units;
 * conversion happens only at display time (see utils/units.ts).
 */

/** NASA Human Research Program's five hazards of human spaceflight. */
export type HazardId = 'radiation' | 'isolation' | 'distance' | 'gravity' | 'environment';

export type EnvironmentId =
  | 'iss'
  | 'gateway'
  | 'lunar-surface'
  | 'mars-transit'
  | 'mars-surface'
  | 'rover';

/** Clickable physiological systems on the body map. */
export type SystemId =
  | 'cardio'
  | 'musculoskeletal'
  | 'sans'
  | 'immune'
  | 'behavioral'
  | 'gi'
  | 'skin'
  | 'lungs';

export type IndicatorId =
  | 'heartRate'
  | 'systolic'
  | 'diastolic'
  | 'spo2'
  | 'temperature'
  | 'glucose'
  | 'respRate'
  | 'sleepHours'
  | 'sleepQuality'
  | 'mood'
  | 'stress'
  | 'fatigue'
  | 'bodyMass'
  | 'hydration'
  | 'exerciseResistive'
  | 'exerciseAerobic'
  | 'radiationDose'
  | 'reactionTime'
  | 'pvtLapses';

export type SymptomId =
  | 'headache'
  | 'visionChange'
  | 'nausea'
  | 'dizziness'
  | 'backPain'
  | 'congestion'
  | 'skinRash'
  | 'insomnia'
  | 'muscleCramps'
  | 'chestPain'
  | 'shortnessOfBreath'
  | 'fever';

/** Triage levels, ordered by severity. */
export type StatusLevel = 'nominal' | 'monitor' | 'act' | 'critical';

export type RadiationLevel = 'low' | 'moderate' | 'high' | 'very-high';

export interface MissionEnvironment {
  id: EnvironmentId;
  name: string;
  short: string;
  gravityG: number;
  /** Description of the one-way light-time delay range. */
  delayLabel: string;
  radiationLevel: RadiationLevel;
  /** Typical background dose for this environment, mSv/day. */
  baselineDoseMsvPerDay: number;
  resupply: string;
  emphasizedSystems: SystemId[];
  emphasizedHazards: HazardId[];
  description: string;
}

export interface CrewMember {
  id: string;
  name: string;
  callsign: string;
  role: string;
  age: number;
  color: string;
  /** Access role in the mission (cloud mode): astronaut, cmo or ground. Local/demo crews are astronauts. */
  missionRole?: Role;
}

export type IndicatorValues = Partial<Record<IndicatorId, number>>;

export interface CheckIn {
  id: string;
  crewId: string;
  day: number;
  timestamp: string;
  values: IndicatorValues;
  symptoms: SymptomId[];
  notes?: string;
  source: 'manual' | 'camera' | 'seed' | 'device';
}

export type MissionEventType = 'eva' | 'spe' | 'illness' | 'intervention' | 'other';

export interface MissionEvent {
  id: string;
  day: number;
  type: MissionEventType;
  label: string;
  /** Empty = whole crew. */
  crewIds: string[];
}

export interface CognitiveResult {
  id: string;
  crewId: string;
  day: number;
  timestamp: string;
  meanRt: number;
  medianRt: number;
  lapses: number;
  falseStarts: number;
  trials: number;
}

export interface JournalEntry {
  id: string;
  crewId: string;
  day: number;
  timestamp: string;
  mood: number;
  note: string;
  /** Isolation & confinement wellbeing score 0–100. */
  wellbeing: number;
  answers: number[];
  connectedHome: boolean;
}

export interface Attachment {
  id: string;
  crewId: string;
  day: number;
  timestamp: string;
  system: SystemId;
  kind: 'skin' | 'eye' | 'ultrasound' | 'other';
  note: string;
  dataUrl: string;
}

export type PacketStatus = 'queued' | 'transmitting' | 'delivered' | 'replied';

export interface GroundPacket {
  id: string;
  crewId: string;
  createdAt: string;
  day: number;
  rawBytes: number;
  compressedBytes: number;
  /** One-way delay at send time, seconds. */
  delaySec: number;
  status: PacketStatus;
  sentAt?: string;
  deliveredAt?: string;
  replyAt?: string;
  reply?: string;
  summary: string;
  overall: StatusLevel;
  /** Rule id of the top alert, used to tailor the simulated reply. */
  topRule?: string;
  /** Full health packet (JSON) when synced to the cloud. */
  payload?: unknown;
}

/** astronaut: own data only · cmo: crew medical officer (sees crew) · ground: Mission Control flight surgeon/engineer. */
export type Role = 'astronaut' | 'cmo' | 'ground';

export interface UnitPrefs {
  temperature: 'C' | 'F';
  mass: 'kg' | 'lb';
  glucose: 'mg/dL' | 'mmol/L';
}

export interface Settings {
  id: 'settings';
  units: UnitPrefs;
  highContrast: boolean;
  reducedMotion: boolean;
  aiEnabled: boolean;
  notifications: boolean;
  passcodeHash: string | null;
  passcodeSalt: string | null;
  /** Demo time-warp: how many simulated seconds pass per real second during ground transmission. */
  timeWarp: number;
  thresholdOverrides: Partial<Record<IndicatorId, Partial<ThresholdBands>>>;
  tourSeen: boolean;
  /** Beep / chime / vibration for health alerts. */
  alertSound: boolean;
}

export interface Mission {
  id: 'mission';
  name: string;
  environmentId: EnvironmentId;
  startDate: string;
  activeCrewId: string;
  lastGroundSync: string;
  demo: boolean;
  /** Supabase mission UUID when this mission is synced to the cloud. */
  cloudId?: string;
}

/**
 * Status bands. A value at or beyond a bound gets that level.
 * e.g. actHigh: 140 means >= 140 is "act".
 */
export interface ThresholdBands {
  critLow?: number;
  actLow?: number;
  monLow?: number;
  monHigh?: number;
  actHigh?: number;
  critHigh?: number;
}

export interface Baseline {
  mean: number;
  sd: number;
  n: number;
}

export interface IndicatorAssessment {
  indicator: IndicatorId;
  value: number;
  day: number;
  level: StatusLevel;
  absoluteLevel: StatusLevel;
  baselineLevel: StatusLevel;
  baseline: Baseline | null;
  z: number | null;
  pctFromBaseline: number | null;
  sustained: 'high' | 'low' | null;
  reasons: string[];
}

export interface Alert {
  id: string;
  ruleId: string;
  level: StatusLevel;
  title: string;
  why: string[];
  systems: SystemId[];
  hazards: HazardId[];
  guidanceIds: string[];
  actions: string[];
  escalateWhen: string;
  indicators: IndicatorId[];
}

export interface SystemAssessment {
  system: SystemId;
  level: StatusLevel;
  reasons: string[];
  alertIds: string[];
}

export interface TriageResult {
  crewId: string;
  day: number;
  overall: StatusLevel;
  indicators: Partial<Record<IndicatorId, IndicatorAssessment>>;
  systems: Record<SystemId, SystemAssessment>;
  alerts: Alert[];
  readiness: number;
}

/** Sensor channels streamed by suits, wearables and Bluetooth medical devices. */
export type ChannelId =
  | 'hr'
  | 'hrv'
  | 'spo2'
  | 'temp'
  | 'resp'
  | 'sys'
  | 'dia'
  | 'mass'
  | 'suitPressure'
  | 'suitCo2'
  | 'o2'
  | 'doseRate';

export type ChannelValues = Partial<Record<ChannelId, number>>;

/** One-minute aggregate of streamed sensor data. */
export interface VitalSample {
  id: string;
  crewId: string;
  ts: string;
  channels: ChannelValues;
  sources: string[];
}

/** Message from the ground team / CMO to a crew member. */
export interface GroundMessage {
  id: string;
  crewId: string;
  authorId: string;
  authorName: string;
  body: string;
  packetId?: string;
  createdAt: string;
  readAt?: string;
}

/** Alert record shared with the ground (from triage or a live sensor alarm). */
export interface SharedAlert {
  id: string;
  crewId: string;
  day: number;
  level: StatusLevel;
  ruleId: string;
  title: string;
  why: string[];
  actions: string[];
  source: 'triage' | 'live';
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

export type SyncTable =
  | 'check_ins'
  | 'cognitive_results'
  | 'journal_entries'
  | 'vital_samples'
  | 'alerts'
  | 'packets'
  | 'ground_messages'
  | 'mission_events';

export interface OutboxItem {
  seq?: number;
  table: SyncTable;
  rowId: string;
  row: Record<string, unknown>;
  createdAt: string;
  tries: number;
}
