// Data access layer. Thin: SQL in/out, domain logic stays in src/domain.

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { applyConfounderFlags, isInConfounderWindow } from '../domain/confounders';
import { abandonExperiment, cloneExperiment, completeExperiment, startExperiment } from '../domain/lifecycle';
import {
  currentPhase,
  phaseForTimestamp,
  shouldAutoTransition,
  transitionToNext,
  upcomingPhase,
} from '../domain/phase-engine';
import { compareMetricAcrossPhases, contextLine } from '../domain/verdict-math';
import {
  Confounder,
  Experiment,
  Metric,
  MetricSchedule,
  Observation,
  Phase,
  Verdict,
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
  upcomingPhase: Phase | null; // future-start experiments
  todayCounts: Record<string, number>; // metricId -> observations logged on the selected day
  sparkMetric: Metric | null; // first scale/numeric metric, drives the card sparkline
  sparkValues: number[]; // its non-missed values in time order
  missedCounts: Record<string, number>; // metricId -> missed markers on the selected day
}

/** Bundles for the Today screen. `forDate` selects which day the counts cover. */
export async function getActiveExperiments(
  now: number,
  forDate?: number
): Promise<ActiveExperimentBundle[]> {
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

  const dayStart = new Date(forDate ?? now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;
  const metricIds = metrics.map((m) => m.id);
  // Count in JS — observation volume is tiny (personal app).
  const countAll: Record<string, number> = {};
  const missedAll: Record<string, number> = {};
  const valuesByMetric: Record<string, { at: number; value: number }[]> = {};
  if (metricIds.length > 0) {
    const rows = await db
      .select()
      .from(t.observations)
      .where(inArray(t.observations.metricId, metricIds));
    for (const o of rows) {
      if (o.observedAt >= dayStart.getTime() && o.observedAt < dayEnd) {
        countAll[o.metricId] = (countAll[o.metricId] ?? 0) + 1;
        if (o.missed) missedAll[o.metricId] = (missedAll[o.metricId] ?? 0) + 1;
      }
      if (!o.missed) {
        (valuesByMetric[o.metricId] ??= []).push({ at: o.observedAt, value: o.value });
      }
    }
    for (const list of Object.values(valuesByMetric)) list.sort((a, b) => a.at - b.at);
  }

  return experiments.map((experiment) => {
    const expPhases = phases.filter((p) => p.experimentId === experiment.id);
    const expMetrics = metrics.filter((m) => m.experimentId === experiment.id);
    const todayCounts: Record<string, number> = {};
    const missedCounts: Record<string, number> = {};
    for (const m of expMetrics) {
      todayCounts[m.id] = countAll[m.id] ?? 0;
      missedCounts[m.id] = missedAll[m.id] ?? 0;
    }
    const sparkMetric =
      expMetrics.find((m) => m.type === 'scale' || m.type === 'numeric') ?? null;
    return {
      experiment,
      phases: expPhases,
      metrics: expMetrics,
      activePhase: currentPhase(expPhases, now),
      upcomingPhase: upcomingPhase(expPhases, now),
      todayCounts,
      missedCounts,
      sparkMetric,
      sparkValues: sparkMetric ? (valuesByMetric[sparkMetric.id] ?? []).map((v) => v.value) : [],
    };
  });
}

/** Which of the last `days` days have at least one logged observation (dots on the date bar). */
export async function getActivityDays(now: number, days = 7): Promise<Record<number, boolean>> {
  const end = new Date(now).setHours(0, 0, 0, 0) + 24 * 60 * 60 * 1000;
  const start = end - days * 24 * 60 * 60 * 1000;
  const rows = await db.select().from(t.observations);
  const activity: Record<number, boolean> = {};
  for (const o of rows) {
    if (o.observedAt >= start && o.observedAt < end) {
      activity[new Date(o.observedAt).setHours(0, 0, 0, 0)] = true;
    }
  }
  return activity;
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

/**
 * Quick-log an observation. observedAt defaults to now; backdated entries
 * (before today) resolve their phase from the timestamp and are tagged
 * backfilled — shown subtly, trust the user but leave a trace (spec §3.2).
 */
export async function logObservation(params: {
  metricId: string;
  value: number;
  note?: string;
  now: number;
  observedAt?: number;
  missed?: boolean;
}): Promise<Observation> {
  const metric = await getMetric(params.metricId);
  if (!metric) throw new Error('Metric not found');
  const phases = await getExperimentPhases(metric.experimentId);
  const observedAt = params.observedAt ?? params.now;
  const startOfToday = new Date(params.now).setHours(0, 0, 0, 0);
  const backfilled = observedAt < startOfToday;
  const phase = backfilled
    ? phaseForTimestamp(phases, observedAt)
    : currentPhase(phases, params.now);
  if (!phase) throw new Error('No phase covers that time — cannot log');
  const confounders = await getConfounders(metric.experimentId);

  const obs: Observation = {
    id: newId(),
    metricId: params.metricId,
    phaseId: phase.id,
    value: params.value,
    note: params.note ?? null,
    observedAt,
    backfilled,
    flagged: isInConfounderWindow(observedAt, confounders),
    missed: !!params.missed,
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
  startAt?: number;
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
      startAt: params.startAt,
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

/** Save the verdict and complete the experiment (spec §4.4 — verdict is mandatory). */
export async function saveVerdict(params: {
  experimentId: string;
  outcome: Verdict['outcome'];
  conclusion: string;
  willAdopt: boolean | null;
  now: number;
}): Promise<void> {
  const rows = await db
    .select()
    .from(t.experiments)
    .where(eq(t.experiments.id, params.experimentId))
    .limit(1);
  const experiment = rows[0] as Experiment | undefined;
  if (!experiment) throw new Error('Experiment not found');

  const verdict: Verdict = {
    id: newId(),
    experimentId: params.experimentId,
    outcome: params.outcome,
    conclusion: params.conclusion,
    willAdopt: params.willAdopt,
    createdAt: params.now,
  };
  const completed = completeExperiment(experiment, verdict, params.now);
  await db.insert(t.verdicts).values(verdict);
  await db
    .update(t.experiments)
    .set({ status: completed.status, endedAt: completed.endedAt, verdictId: completed.verdictId })
    .where(eq(t.experiments.id, params.experimentId));
}

export interface HistoryEntry {
  experiment: Experiment;
  verdict: Verdict | null;
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const experiments = (await db
    .select()
    .from(t.experiments)
    .where(inArray(t.experiments.status, ['completed', 'abandoned']))
    .orderBy(desc(t.experiments.endedAt))) as Experiment[];
  const out: HistoryEntry[] = [];
  for (const experiment of experiments) {
    let verdict: Verdict | null = null;
    if (experiment.verdictId) {
      const v = await db
        .select()
        .from(t.verdicts)
        .where(eq(t.verdicts.id, experiment.verdictId))
        .limit(1);
      verdict = (v[0] as Verdict) ?? null;
    }
    out.push({ experiment, verdict });
  }
  return out;
}

export async function getVerdict(experimentId: string): Promise<Verdict | null> {
  const rows = await db
    .select()
    .from(t.verdicts)
    .where(eq(t.verdicts.experimentId, experimentId))
    .limit(1);
  return (rows[0] as Verdict) ?? null;
}

/** Clone a finished experiment back to a fresh draft (metrics included). */
export async function cloneExperimentById(experimentId: string, now: number): Promise<string> {
  const detail = await getExperimentDetail(experimentId);
  if (!detail) throw new Error('Experiment not found');
  const cloned = cloneExperiment(detail.experiment, detail.phases, now, newId);
  const metrics: Metric[] = detail.metrics.map((m) => ({
    ...m,
    id: newId(),
    experimentId: cloned.experiment.id,
  }));
  await db.insert(t.experiments).values(cloned.experiment);
  if (cloned.phases.length > 0) await db.insert(t.phases).values(cloned.phases);
  if (metrics.length > 0) await db.insert(t.metrics).values(metrics);
  return cloned.experiment.id;
}

export interface Insight {
  experiment: Experiment;
  verdict: Verdict | null;
  /** Headline finding: first metric with 2+ phases of data, as an honest context line. */
  headline: string | null;
}

export interface InsightStats {
  completed: number;
  adopted: number;
  refuted: number;
  observations: number;
}

/** Completed/abandoned experiments enriched with their key finding + aggregate stats. */
export async function getInsights(): Promise<{ stats: InsightStats; insights: Insight[] }> {
  const history = await getHistory();
  const insights: Insight[] = [];
  let totalObservations = 0;
  for (const { experiment, verdict } of history) {
    const detail = await getExperimentDetail(experiment.id);
    let headline: string | null = null;
    if (detail) {
      totalObservations += detail.observations.length;
      for (const metric of detail.metrics) {
        const cmp = compareMetricAcrossPhases(metric, detail.phases, detail.observations, {});
        if (cmp.phases.filter((s) => s.n > 0).length >= 2) {
          headline = `${metric.name} — ${contextLine(metric, cmp)}`;
          break;
        }
      }
    }
    insights.push({ experiment, verdict, headline });
  }
  return {
    stats: {
      completed: history.filter((h) => h.experiment.status === 'completed').length,
      adopted: history.filter((h) => h.verdict?.willAdopt === true).length,
      refuted: history.filter((h) => h.verdict?.outcome === 'refuted').length,
      observations: totalObservations,
    },
    insights,
  };
}

/** Full data dump for JSON export (spec: local-first, manual export). */
export async function exportAllJson(): Promise<string> {
  const [experiments, phases, metrics, observations, confounders, verdicts] = await Promise.all([
    db.select().from(t.experiments),
    db.select().from(t.phases),
    db.select().from(t.metrics),
    db.select().from(t.observations),
    db.select().from(t.confounders),
    db.select().from(t.verdicts),
  ]);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      schema: 1,
      experiments,
      phases,
      metrics,
      observations,
      confounders,
      verdicts,
    },
    null,
    2
  );
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
    let active = currentPhase(phases, now);
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
      active = currentPhase(phases, now);
      if (r.done) break;
    }
  }
  return transitions;
}
