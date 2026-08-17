import { describe, expect, it } from 'vitest';
import { buildPrompt, parseDraft } from './ai-draft';

const VALID = {
  title: 'Coffee cutoff',
  hypothesis: 'I believe no coffee after 2pm will improve my sleep as measured by sleep quality',
  archetype: 'health',
  metrics: [
    {
      name: 'Sleep quality',
      type: 'scale',
      config: { min: 1, max: 5 },
      schedule: { timesPerDay: 1, remindAt: ['08:00'] },
      direction: 'higher_is_better',
    },
  ],
  phases: [
    { type: 'baseline', label: 'Normal coffee', plannedDays: 7 },
    { type: 'intervention', label: 'Cutoff 2pm', plannedDays: 14 },
  ],
};

describe('parseDraft', () => {
  it('parses a clean JSON response', () => {
    const d = parseDraft(JSON.stringify(VALID));
    expect(d.title).toBe('Coffee cutoff');
    expect(d.metrics).toHaveLength(1);
    expect(d.phases[1].plannedDays).toBe(14);
  });

  it('tolerates markdown fences and prose around the JSON', () => {
    const raw = `Here you go!\n\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\`\nGood luck!`;
    const d = parseDraft(raw);
    expect(d.archetype).toBe('health');
  });

  it('caps metrics at 4', () => {
    const many = { ...VALID, metrics: Array(6).fill(VALID.metrics[0]) };
    expect(parseDraft(JSON.stringify(many)).metrics).toHaveLength(4);
  });

  it('falls back on invalid schedule and direction', () => {
    const messy = {
      ...VALID,
      metrics: [{ name: 'X', type: 'scale', config: {}, schedule: { bogus: 1 }, direction: 'up' }],
    };
    const d = parseDraft(JSON.stringify(messy));
    expect(d.metrics[0].schedule).toEqual({ timesPerDay: 1, remindAt: ['20:00'] });
    expect(d.metrics[0].direction).toBe('neutral');
  });

  it('rejects missing hypothesis / bad phase type / no JSON', () => {
    expect(() => parseDraft(JSON.stringify({ ...VALID, hypothesis: '' }))).toThrow('hypothesis');
    expect(() =>
      parseDraft(JSON.stringify({ ...VALID, phases: [{ type: 'warmup', label: 'A', plannedDays: 7 }] }))
    ).toThrow('bad type');
    expect(() => parseDraft('no json here')).toThrow('No JSON');
  });
});

describe('buildPrompt', () => {
  it('embeds the idea and the schema', () => {
    const p = buildPrompt('  cut sugar  ');
    expect(p).toContain('"cut sugar"');
    expect(p).toContain('"archetype"');
    expect(p).toContain('Max 4 metrics');
  });
});
