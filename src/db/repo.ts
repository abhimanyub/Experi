// Data access layer. Thin: SQL in/out, domain logic stays in src/domain.

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { applyConfounderFlags, isInConfounderWindow } from '../domain/confounders';
import { abandonExperiment, startExperiment } from '../domain/lifecycle';
import { currentPhase, shouldAutoTransition, transitionToNext } from '../domain/phase-engine';
import {
  Confounder,
  Experiment,
  Metric,
  MetricSchedule,
  Observation,
  Phase,
} from '../domain/types';
import { newId } from '../lib/ids';
import { db } from './client';
import * as t from './schema';

// ---------- row mappers (DB rows use the same field names; JSON columns need casts) ----------

function metricFromRow(r: typeof t.metrics.$inferSelect): Metric {
  return { ...r, config: r.config as Metric['config'], schedule: r.schedule as MetricSchedule };
}

// ---------- reads ----------

export interface ActiveExperimentBundle {
  experiment: Experiment;
  phases: Phase[];
  metrics: Metric[];
  activePhase: Phase | null;
  todayCounts: Record<string, number>; // metricId -> observations logged today
}

export async function getActiveExperiments(now: number): Promise<ActiveExperimentBundle[]> {
  const experiments = (await db
    .select()
    .from(t.experiments)
    .where(eq(t.experiments.status, 'active'))
    .orderBy(asc(t.experiments.startedAt))) as Experiment[];
  if (experiments.length === 0) return [];

  const ids = experiments.map((e) => e.id);
  const phases = (await db
    .select()
    .from(t.phases)
    .where(inArray(t.phases.experimentId, ids))
    .orderBy(asc(t.phases.sequence))) as Phase[];
  const metricRows = await db.select().from(t.metrics).where(inArray(t.metrics.experimentId, ids));
  const metrics = metricRows.map(metricFromRow);

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const metricIds = metrics.map((m) => m.id);
  // Count in JS — observation volume is tiny (personal app).
  const todayCountAll: Record<string, number> = {};
  if (metricIds.length > 0) {
    const todayRows = await db
      .select()
      .from(t.observations)
      .where(inArray(t.observations.metricId, metricIds));
    for (const o of todayRows) {
      if (o.observedAt >= startOfDay.getTime()) {
        todayCountAll[o.metricId] = (todayCountAll[o.metricId] ?? 0) + 1;
      }
    }
  }

  return experiments.map((experiment) => {
    const expPhases = phases.filter((p) => p.experimentId === experiment.id);
    const expMetrics = metrics.filter((m) => m.experimentId === experiment.id);
    const todayCounts: Record<string, number> = {};
    for (const m of expMetrics) todayCounts[m.id] = todayCountAll[m.id] ?? 0;
    return {
      experiment,
      phases: expPhases,
      metrics: expMetrics,
      activePhase: currentPhase(expPhases),
      todayCounts,
    };
  });
}

export async function getMetric(metricId: string): Promise<Metric | null> {
  const rows = await db.select().from(t.metrics).where(eq(t.metrics.id, metricId)).limit(1);
  return rows[0] ? metricFromRow(rows[0]) : null;
}

export async function getExperimentPhases(experimentId: string): Promise<Phase[]> {
  return (await db
    .select()
    .from(t.phases)
    .where(eq(t.phases.experimentId, experimentId))
    .orderBy(asc(t.phases.sequence))) as Phase[];
}

export async function getConfounders(experimentId: string): Promise<Confounder[]> {
  return (await db
    .select()
    .from(t.confounders)
    .where(eq(t.confounders.experimentId, experimentId))
    .orderBy(desc(t.confounders.startsAt))) as Confounder[];
}

export async function getRecentObservations(
  metricId: string,
  limit = 20
): Promise<Observation[]> {
  return (await db
    .select()
    .from(t.observations)
    .where(eq(t.observations.metricId, metricId))
    .orderBy(desc(t.observations.observedAt))
    .limit(limit)) as Observation[];
}

// ---------- writes ----------

/** Quick-log an observation. Resolves phase from the active phase; flags via confounders. */
export async function logObservation(params: {
  metricId: string;
  value: number;
  note?: string;
  now: number;
}): Promise<Observation> {
  const metric = await getMetric(params.metricId);
  if (!metric) throw new Error('Metric not found');
  const phases = await getExperimentPhases(metric.experimentId);
  const active = currentPhase(phases);
  if (!active) throw new Error('No active phase — cannot log');
  const confounders = await getConfounders(metric.experimentId);

  const obs: Observation = {
    id: newId(),
    metricId: params.metricId,
    phaseId: active.id,
    value: params.value,
    note: params.note ?? null,
    observedAt: params.now,
    backfilled: false,
    flagged: isInConfounderWindow(params.now, confounders),
  };
  await db.insert(t.observations).values(obs);
  return obs;
}

export async function addConfounder(params: {
  experimentId: string;
  note: string;
  startsAt: number;
  endsAt?: number | null;
}): Promise<void> {
  const confounder: Confounder = {
    id: newId(),
    experimentId: params.experimentId,
    note: params.note,
    startsAt: params.startsAt,
    endsAt: params.endsAt ?? null,
  };
  await db.insert(t.confounders).values(confounder);
  // Re-flag existing observations that now fall inside a confounder window.
  const metricRows = await db
    .select()
    .from(t.metrics)
    .where(eq(t.metrics.experimentId, params.experimentId));
  const metricIds = metricRows.map((m) => m.id);
  if (metricIds.length === 0) return;
  const all = (await db
    .select()
    .from(t.observations)
    .where(inArray(t.observations.metricId, metricIds))) as Observation[];
  const confounders = await getConfounders(params.experimentId);
  const reflagged = applyConfounderFlags(all, confounders);
  for (let i = 0; i < all.length; i++) {
    if (reflagged[i] !== all[i]) {
      await db
        .update(t.observations)
        .set({ flagged: reflagged[i].flagged })
        .where(eq(t.observations.id, all[i].id));
    }
  }
}

export interface NewMetricInput {
  name: string;
  type: Metric['type'];
  config: Metric['config'];
  schedule: MetricSchedule;
  direction: Metric['direction'];
}

export interface NewPhaseInput {
  type: Phase['type'];
  label: string;
  plannedDays: number;
}

/** Create an experiment from wizard output. Starts immediately unless saved as draft. */
export async function createExperiment(params: {
  title: string;
  hypothesis: string;
  archetype: Experiment['archetype'];
  metrics: NewMetricInput[];
  phases: NewPhaseInput[];
  now: number;
  start: boolean;
  skipBaseline?: boolean;
}): Promise<string> {
  const { title, hypothesis, archetype, now } = params;
  const experimentId = newId();

  const experiment: Experiment = {
    id: experimentId,
    title,
    hypothesis,
    archetype,
    status: 'draft',
    createdAt: now,
    startedAt: null,
    endedAt: null,
    verdictId: null,
    baselineSkipped: false,
    abandonReason: null,
  };
  const phases: Phase[] = params.phases.map((p, i) => ({
    id: newId(),
    experimentId,
    type: p.type,
    label: p.label,
    sequence: i,
    plannedDays: p.plannedDays,
    startedAt: null,
    endedAt: null,
  }));
  const metrics: Metric[] = params.metrics.map((m) => ({
    id: newId(),
    experimentId,
    ...m,
  }));

  if (params.start) {
    const started = startExperiment(experiment, phases, now, {
      skipBaseline: params.skipBaseline,
    });
    await db.insert(t.experiments).values(started.experiment);
    await db.insert(t.phases).values(started.phases.updated);
  } else {
    await db.insert(t.experiments).values(experiment);
    if (phases.length > 0) await db.insert(t.phases).values(phases);
  }
  if (metrics.length > 0) await db.insert(t.metrics).values(metrics);
  return experimentId;
}

export interface DraftBundle {
  experiment: Experiment;
  phases: Phase[];
  metrics: Metric[];
}

export async function getDraftExperiments(): Promise<DraftBundle[]> {
  const drafts = (await db
    .select()
    .from(t.experiments)
    .where(eq(t.experiments.status, 'draft'))
    .orderBy(desc(t.experiments.createdAt))) as Experiment[];
  const out: DraftBundle[] = [];
  for (const experiment of drafts) {
    out.push({
      experiment,
      phases: await getExperimentPhases(experiment.id),
      metrics: (
        await db.select().from(t.metrics).where(eq(t.metrics.experimentId, experiment.id))
      ).map(metricFromRow),
    });
  }
  return out;
}

/** Start a saved draft. skipBaseline records the skip and deletes baseline phases. */
export async function startDraft(
  experimentId: string,
  now: number,
  opts: { skipBaseline?: boolean } = {}
): Promise<void> {
  const rows = await db
    .select()
    .from(t.experiments)
    .where(eq(t.experiments.id, experimentId))
    .limit(1);
  const experiment = rows[0] as Experiment | undefined;
  if (!experiment) throw new Error('Experiment not found');
  const phases = await getExperimentPhases(experimentId);

  const started = startExperiment(experiment, phases, now, { skipBaseline: opts.skipBaseline });
  const keptIds = new Set(started.phases.updated.map((p) => p.id));
  for (const p of phases) {
    if (!keptIds.has(p.id)) {
      await db.delete(t.phases).where(eq(t.phases.id, p.id));
    }
  }
  for (const p of started.phases.updated) {
    await db
      .update(t.phases)
      .set({ startedAt: p.startedAt, endedAt: p.endedAt })
      .where(eq(t.phases.id, p.id));
  }
  const e = started.experiment;
  await db
    .update(t.experiments)
    .set({ status: e.status, startedAt: e.startedAt, baselineSkipped: e.baselineSkipped })
    .where(eq(t.experiments.id, experimentId));
}

/** Delete a draft outright (spec §4: drafts may be deleted). */
export async function deleteDraft(experimentId: string): Promise<void> {
  const rows = await db
    .select()
    .from(t.experiments)
    .where(eq(t.experiments.id, experimentId))
    .limit(1);
  if (!rows[0]) return;
  if (rows[0].status !== 'draft') throw new Error('Only drafts can be deleted');
  await db.delete(t.experiments).where(eq(t.experiments.id, experimentId));
}

export interface ExperimentDetail {
  experiment: Experiment;
  phases: Phase[];
  metrics: Metric[];
  observations: Observation[];
  confounders: Confounder[];
}

export async function getExperimentDetail(experimentId: string): Promise<ExperimentDetail | null> {
  const rows = await db
    .select()
    .from(t.experiments)
    .where(eq(t.experiments.id, experimentId))
    .limit(1);
  const experiment = rows[0] as Experiment | undefined;
  if (!experiment) return null;
  const metrics = (
    await db.select().from(t.metrics).where(eq(t.metrics.experimentId, experimentId))
  ).map(metricFromRow);
  const metricIds = metrics.map((m) => m.id);
  const observations =
    metricIds.length > 0
      ? ((await db
          .select()
          .from(t.observations)
          .where(inArray(t.observations.metricId, metricIds))
          .orderBy(asc(t.observations.observedAt))) as Observation[])
      : [];
  return {
    experiment,
    phases: await getExperimentPhases(experimentId),
    metrics,
    observations,
    confounders: await getConfounders(experimentId),
  };
}

/** Close an open-ended confounder window. */
export async function closeConfounder(confounderId: string, endsAt: number): Promise<void> {
  await db.update(t.confounders).set({ endsAt }).where(eq(t.confounders.id, confounderId));
}

export async function deleteObservation(observationId: string): Promise<void> {
  await db.delete(t.observations).where(eq(t.observations.id, observationId));
}

/** End the current phase before its planned duration (user confirmed). */
export async function endPhaseEarly(experimentId: string, now: number): Promise<void> {
  const phases = await getExperimentPhases(experimentId);
  const r = transitionToNext(phases, now, { confirmEarly: true });
  for (const p of r.updated) {
    await db
      .update(t.phases)
      .set({ startedAt: p.startedAt, endedAt: p.endedAt })
      .where(eq(t.phases.id, p.id));
  }
}

/** Abandon an active experiment (reason required — spec §4). */
export async function abandonExperimentById(
  experimentId: string,
  now: number,
  reason: string
): Promise<void> {
  const rows = await db
    .select()
    .from(t.experiments)
    .where(eq(t.experiments.id, experimentId))
    .limit(1);
  const experiment = rows[0] as Experiment | undefined;
  if (!experiment) throw new Error('Experiment not found');
  const updated = abandonExperiment(experiment, now, reason);
  await db
    .update(t.experiments)
    .set({ status: updated.status, endedAt: updated.endedAt, abandonReason: updated.abandonReason })
    .where(eq(t.experiments.id, experimentId));
}

/** Auto-advance any active phases past their planned duration. Call on app foreground. */
export async function syncPhaseTransitions(now: number): Promise<number> {
  const experiments = await db
    .select()
    .from(t.experiments)
    .where(eq(t.experiments.status, 'active'));
  let transitions = 0;
  for (const e of experiments) {
    let phases = await getExperimentPhases(e.id);
    let active = currentPhase(phases);
    while (active && shouldAutoTransition(active, now)) {
      const r = transitionToNext(phases, now);
      for (const p of r.updated) {
        if (p.startedAt !== phases.find((x) => x.id === p.id)?.startedAt || p.endedAt !== phases.find((x) => x.id === p.id)?.endedAt) {
          await db
            .update(t.phases)
            .set({ startedAt: p.startedAt, endedAt: p.endedAt })
            .where(eq(t.phases.id, p.id));
        }
      }
      transitions++;
      phases = r.updated;
      active = currentPhase(phases);
      if (r.done) break;
    }
  }
  return transitions;
}
