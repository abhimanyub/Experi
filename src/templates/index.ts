// v1 templates (§5). Pre-fill metrics + phases; user edits everything in the wizard.
// Templates are data over the generic schema — nothing here is special-cased downstream.

import { Archetype, Direction, MetricSchedule, MetricType, PhaseType } from '../domain/types';

export interface TemplateMetric {
  name: string;
  type: MetricType;
  config: Record<string, unknown>;
  schedule: MetricSchedule;
  direction: Direction;
}

export interface TemplatePhase {
  type: PhaseType;
  label: string;
  plannedDays: number;
  optional?: boolean;
}

export interface ExperimentTemplate {
  key: string;
  title: string;
  archetype: Archetype;
  description: string;
  example: string;
  metrics: TemplateMetric[];
  phases: TemplatePhase[];
  alternating?: { rounds: number; daysEach: number }; // A/B/A/B option
}

export const TEMPLATES: ExperimentTemplate[] = [
  {
    key: 'food_elimination',
    title: 'Food / elimination',
    archetype: 'health',
    description: 'Remove something, watch a symptom, optionally reintroduce.',
    example: 'Cut dairy → bloating',
    metrics: [
      {
        name: 'Symptom',
        type: 'scale',
        config: { min: 1, max: 5 },
        schedule: { timesPerDay: 1, remindAt: ['20:00'] },
        direction: 'lower_is_better',
      },
      {
        name: 'Energy',
        type: 'scale',
        config: { min: 1, max: 5 },
        schedule: { timesPerDay: 3, remindAt: ['09:00', '13:00', '18:00'] },
        direction: 'higher_is_better',
      },
    ],
    phases: [
      { type: 'baseline', label: 'Baseline', plannedDays: 7 },
      { type: 'intervention', label: 'Elimination', plannedDays: 14 },
      { type: 'reversal', label: 'Reintroduction', plannedDays: 7, optional: true },
    ],
  },
  {
    key: 'routine_swap',
    title: 'Routine swap',
    archetype: 'routine',
    description: 'Compare two ways of doing the same thing.',
    example: 'Morning vs evening workouts',
    metrics: [
      {
        name: 'Primary outcome',
        type: 'scale',
        config: { min: 1, max: 5 },
        schedule: { timesPerDay: 1, remindAt: ['16:00'] },
        direction: 'higher_is_better',
      },
      {
        name: 'Adherence',
        type: 'boolean',
        config: {},
        schedule: { timesPerDay: 1, remindAt: ['21:00'] },
        direction: 'higher_is_better',
      },
    ],
    phases: [
      { type: 'baseline', label: 'A', plannedDays: 7 },
      { type: 'intervention', label: 'B', plannedDays: 7 },
    ],
    alternating: { rounds: 2, daysEach: 7 },
  },
  {
    key: 'make_vs_buy',
    title: 'Make vs buy',
    archetype: 'cost_benefit',
    description: 'Is doing it yourself actually worth it?',
    example: 'Home cold brew vs café',
    metrics: [
      {
        name: 'Cost per unit',
        type: 'currency',
        config: { code: 'USD' },
        schedule: { onDemand: true },
        direction: 'lower_is_better',
      },
      {
        name: 'Time per unit',
        type: 'duration',
        config: { unit: 'min' },
        schedule: { onDemand: true },
        direction: 'lower_is_better',
      },
      {
        name: 'Quality',
        type: 'scale',
        config: { min: 1, max: 5 },
        schedule: { onDemand: true },
        direction: 'higher_is_better',
      },
    ],
    phases: [
      { type: 'baseline', label: 'A: buy', plannedDays: 14 },
      { type: 'intervention', label: 'B: make', plannedDays: 14 },
    ],
  },
  {
    key: 'sleep_substance',
    title: 'Sleep / substance',
    archetype: 'health',
    description: 'Alternate on/off and watch sleep.',
    example: 'Melatonin vs none',
    metrics: [
      {
        name: 'Sleep quality',
        type: 'scale',
        config: { min: 1, max: 5 },
        schedule: { timesPerDay: 1, remindAt: ['08:00'] },
        direction: 'higher_is_better',
      },
      {
        name: 'Time to fall asleep',
        type: 'duration',
        config: { unit: 'min' },
        schedule: { timesPerDay: 1, remindAt: ['08:00'] },
        direction: 'lower_is_better',
      },
    ],
    phases: [
      { type: 'baseline', label: 'A: without', plannedDays: 7 },
      { type: 'intervention', label: 'B: with', plannedDays: 7 },
      { type: 'baseline', label: 'A: without', plannedDays: 7 },
      { type: 'intervention', label: 'B: with', plannedDays: 7 },
    ],
  },
  {
    key: 'custom',
    title: 'Custom',
    archetype: 'custom',
    description: 'Start from scratch.',
    example: 'Anything',
    metrics: [],
    phases: [
      { type: 'baseline', label: 'Baseline', plannedDays: 7 },
      { type: 'intervention', label: 'Intervention', plannedDays: 14 },
    ],
  },
];

export function getTemplate(key: string): ExperimentTemplate | undefined {
  return TEMPLATES.find((t) => t.key === key);
}
