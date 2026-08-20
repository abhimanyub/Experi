// Pure domain types. No DB, no React Native imports.
// Timestamps are epoch milliseconds (number) throughout the domain layer.

export type Archetype = 'health' | 'routine' | 'cost_benefit' | 'custom';
export type ExperimentStatus = 'draft' | 'active' | 'completed' | 'abandoned';
export type PhaseType = 'baseline' | 'intervention' | 'reversal';
export type MetricType = 'scale' | 'numeric' | 'boolean' | 'currency' | 'duration';
export type Direction = 'higher_is_better' | 'lower_is_better' | 'neutral';
export type VerdictOutcome = 'supported' | 'refuted' | 'inconclusive' | 'contaminated';

export interface Experiment {
  id: string;
  title: string;
  hypothesis: string;
  archetype: Archetype;
  status: ExperimentStatus;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  verdictId: string | null;
  baselineSkipped: boolean;
  abandonReason: string | null;
}

export interface Phase {
  id: string;
  experimentId: string;
  type: PhaseType;
  label: string;
  sequence: number; // 0-based ordering; supports A/B/A/B crossover
  plannedDays: number;
  startedAt: number | null;
  endedAt: number | null;
}

export interface ScaleConfig {
  min: number;
  max: number;
  labels?: Record<number, string>;
}
export interface NumericConfig {
  unit: string;
}
export interface CurrencyConfig {
  code: string;
}
export interface DurationConfig {
  unit: 'min' | 'hr';
}
export type MetricConfig =
  | ScaleConfig
  | NumericConfig
  | CurrencyConfig
  | DurationConfig
  | Record<string, never>; // boolean needs no config

export type MetricSchedule =
  | { timesPerDay: number; remindAt: string[] } // "HH:mm" local times
  | { onDemand: true };

export interface Metric {
  id: string;
  experimentId: string;
  name: string;
  type: MetricType;
  config: MetricConfig;
  schedule: MetricSchedule;
  direction: Direction;
}

export interface Observation {
  id: string;
  metricId: string;
  phaseId: string;
  value: number; // booleans as 0/1; currency as decimal
  note: string | null;
  observedAt: number;
  backfilled: boolean;
  flagged: boolean;
  missed: boolean; // explicit "didn't measure" marker — excluded from all math
}

export interface Confounder {
  id: string;
  experimentId: string;
  note: string;
  startsAt: number;
  endsAt: number | null; // null = open-ended
}

export interface Verdict {
  id: string;
  experimentId: string;
  outcome: VerdictOutcome;
  conclusion: string;
  willAdopt: boolean | null;
  createdAt: number;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_PHASE_DAYS = 7;
