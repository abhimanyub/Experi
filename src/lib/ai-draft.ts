// Claude-assisted experiment drafting: build a strict-JSON prompt from the
// user's idea; parse + validate the pasted response into wizard inputs.

import { NewMetricInput, NewPhaseInput } from '../db/repo';
import { Archetype, Direction, MetricType, PhaseType } from '../domain/types';

export interface ParsedDraft {
  title: string;
  hypothesis: string;
  archetype: Archetype;
  metrics: NewMetricInput[];
  phases: NewPhaseInput[];
}

export function buildPrompt(idea: string): string {
  return `You are helping design a personal self-experiment for a lab-notebook app. The app tracks causality (did X change Y), with phases (baseline/intervention/reversal), typed metrics, and a written verdict at the end.

My experiment idea: "${idea.trim()}"

Design the experiment. Think about: what the control (baseline) should be, which 1-4 check-in questions (metrics) actually measure the effect, sensible phase durations (minimum 7 days each), and whether a reversal phase or A/B/A/B alternation would strengthen the conclusion.

Reply with ONLY a JSON object, no markdown fences, matching exactly this schema:
{
  "title": "short experiment title",
  "hypothesis": "I believe [change] will [effect] as measured by [metric]",
  "archetype": "health" | "routine" | "cost_benefit" | "custom",
  "metrics": [
    {
      "name": "string",
      "type": "scale" | "numeric" | "boolean" | "currency" | "duration",
      "config": {},   // scale: {"min":1,"max":5}; numeric: {"unit":"hrs"}; currency: {"code":"USD"}; duration: {"unit":"min"}; boolean: {}
      "schedule": {"timesPerDay": 1, "remindAt": ["20:00"]} or {"onDemand": true},
      "direction": "higher_is_better" | "lower_is_better" | "neutral"
    }
  ],
  "phases": [
    {"type": "baseline" | "intervention" | "reversal", "label": "string", "plannedDays": 7}
  ]
}

Max 4 metrics. Include a baseline phase unless truly impossible. Times are 24h "HH:MM" local.`;
}

const METRIC_TYPES: MetricType[] = ['scale', 'numeric', 'boolean', 'currency', 'duration'];
const PHASE_TYPES: PhaseType[] = ['baseline', 'intervention', 'reversal'];
const DIRECTIONS: Direction[] = ['higher_is_better', 'lower_is_better', 'neutral'];
const ARCHETYPES: Archetype[] = ['health', 'routine', 'cost_benefit', 'custom'];

/** Parse pasted response. Throws with a human-readable message on bad input. */
export function parseDraft(raw: string): ParsedDraft {
  // Tolerate markdown fences and surrounding prose: take the outermost {...}.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in the pasted text.');
  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error('Could not parse JSON — copy the full response and try again.');
  }
  const d = obj as Record<string, unknown>;

  if (typeof d.title !== 'string' || !d.title.trim()) throw new Error('Missing "title".');
  if (typeof d.hypothesis !== 'string' || !d.hypothesis.trim())
    throw new Error('Missing "hypothesis".');
  const archetype = ARCHETYPES.includes(d.archetype as Archetype)
    ? (d.archetype as Archetype)
    : 'custom';

  if (!Array.isArray(d.metrics) || d.metrics.length === 0)
    throw new Error('Needs at least one metric.');
  const metrics: NewMetricInput[] = d.metrics.slice(0, 4).map((m: Record<string, unknown>, i) => {
    if (typeof m.name !== 'string' || !m.name.trim())
      throw new Error(`Metric ${i + 1}: missing name.`);
    if (!METRIC_TYPES.includes(m.type as MetricType))
      throw new Error(`Metric "${m.name}": bad type "${m.type}".`);
    const schedule = m.schedule as Record<string, unknown> | undefined;
    const validSchedule =
      schedule &&
      (schedule.onDemand === true ||
        (typeof schedule.timesPerDay === 'number' && Array.isArray(schedule.remindAt)));
    return {
      name: m.name.trim(),
      type: m.type as MetricType,
      config: (m.config ?? {}) as NewMetricInput['config'],
      schedule: validSchedule
        ? (m.schedule as NewMetricInput['schedule'])
        : { timesPerDay: 1, remindAt: ['20:00'] },
      direction: DIRECTIONS.includes(m.direction as Direction)
        ? (m.direction as Direction)
        : 'neutral',
    };
  });

  if (!Array.isArray(d.phases) || d.phases.length === 0)
    throw new Error('Needs at least one phase.');
  const phases: NewPhaseInput[] = d.phases.map((p: Record<string, unknown>, i) => {
    if (!PHASE_TYPES.includes(p.type as PhaseType))
      throw new Error(`Phase ${i + 1}: bad type "${p.type}".`);
    if (typeof p.label !== 'string' || !p.label.trim())
      throw new Error(`Phase ${i + 1}: missing label.`);
    const days = Number(p.plannedDays);
    if (!Number.isFinite(days) || days < 1)
      throw new Error(`Phase "${p.label}": bad plannedDays.`);
    return { type: p.type as PhaseType, label: p.label.trim(), plannedDays: Math.round(days) };
  });

  return { title: d.title.trim(), hypothesis: d.hypothesis.trim(), archetype, metrics, phases };
}
