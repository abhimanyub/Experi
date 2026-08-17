// Drizzle schema for expo-sqlite. Mirrors src/domain/types.ts.
// Timestamps stored as epoch milliseconds (integer). JSON columns stored as text.

import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const experiments = sqliteTable('experiments', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  hypothesis: text('hypothesis').notNull(),
  archetype: text('archetype', {
    enum: ['health', 'routine', 'cost_benefit', 'custom'],
  }).notNull(),
  status: text('status', {
    enum: ['draft', 'active', 'completed', 'abandoned'],
  })
    .notNull()
    .default('draft'),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  endedAt: integer('ended_at'),
  verdictId: text('verdict_id'),
  baselineSkipped: integer('baseline_skipped', { mode: 'boolean' }).notNull().default(false),
  abandonReason: text('abandon_reason'),
});

export const phases = sqliteTable('phases', {
  id: text('id').primaryKey(),
  experimentId: text('experiment_id')
    .notNull()
    .references(() => experiments.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['baseline', 'intervention', 'reversal'] }).notNull(),
  label: text('label').notNull(),
  sequence: integer('sequence').notNull(),
  plannedDays: integer('planned_days').notNull(),
  startedAt: integer('started_at'),
  endedAt: integer('ended_at'),
});

export const metrics = sqliteTable('metrics', {
  id: text('id').primaryKey(),
  experimentId: text('experiment_id')
    .notNull()
    .references(() => experiments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', {
    enum: ['scale', 'numeric', 'boolean', 'currency', 'duration'],
  }).notNull(),
  config: text('config', { mode: 'json' }).notNull(),
  schedule: text('schedule', { mode: 'json' }).notNull(),
  direction: text('direction', {
    enum: ['higher_is_better', 'lower_is_better', 'neutral'],
  }).notNull(),
});

export const observations = sqliteTable('observations', {
  id: text('id').primaryKey(),
  metricId: text('metric_id')
    .notNull()
    .references(() => metrics.id, { onDelete: 'cascade' }),
  // Denormalized on purpose: verdict math is per-phase aggregation.
  phaseId: text('phase_id')
    .notNull()
    .references(() => phases.id, { onDelete: 'cascade' }),
  value: real('value').notNull(),
  note: text('note'),
  observedAt: integer('observed_at').notNull(),
  backfilled: integer('backfilled', { mode: 'boolean' }).notNull().default(false),
  flagged: integer('flagged', { mode: 'boolean' }).notNull().default(false),
});

export const confounders = sqliteTable('confounders', {
  id: text('id').primaryKey(),
  experimentId: text('experiment_id')
    .notNull()
    .references(() => experiments.id, { onDelete: 'cascade' }),
  note: text('note').notNull(),
  startsAt: integer('starts_at').notNull(),
  endsAt: integer('ends_at'),
});

export const verdicts = sqliteTable('verdicts', {
  id: text('id').primaryKey(),
  experimentId: text('experiment_id')
    .notNull()
    .references(() => experiments.id, { onDelete: 'cascade' }),
  outcome: text('outcome', {
    enum: ['supported', 'refuted', 'inconclusive', 'contaminated'],
  }).notNull(),
  conclusion: text('conclusion').notNull(),
  willAdopt: integer('will_adopt', { mode: 'boolean' }),
  createdAt: integer('created_at').notNull(),
});
