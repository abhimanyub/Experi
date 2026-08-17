// New experiment wizard (M3, spec §7.3):
// template → hypothesis → metrics → phases → review. Start now or save as draft.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  createExperiment,
  getActiveExperiments,
  NewMetricInput,
  NewPhaseInput,
} from '@/db/repo';
import { buildAlternatingPhases } from '@/domain/phase-engine';
import { TEMPLATE_EMOJI } from '@/constants/archetypes';
import { Archetype, MIN_PHASE_DAYS } from '@/domain/types';
import { useAiDraftStore } from '@/lib/ai-draft-store';
import { rescheduleAll } from '@/lib/notifications';
import { defaultMetric, MetricEditor } from '@/components/wizard/metric-editor';
import { PhaseEditor } from '@/components/wizard/phase-editor';
import { ExperimentTemplate, TEMPLATES } from '@/templates';
import { useTheme } from '@/hooks/use-theme';

type Step = 'template' | 'basics' | 'metrics' | 'phases' | 'review';
const STEPS: Step[] = ['template', 'basics', 'metrics', 'phases', 'review'];
const STEP_TITLES: Record<Step, string> = {
  template: 'Template',
  basics: 'Hypothesis',
  metrics: 'Metrics',
  phases: 'Phases',
  review: 'Review',
};

export default function NewExperimentWizard() {
  const router = useRouter();
  const colors = useTheme();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('template');
  const [template, setTemplate] = useState<ExperimentTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [metrics, setMetrics] = useState<NewMetricInput[]>([]);
  const [phases, setPhases] = useState<NewPhaseInput[]>([]);
  const [includeOptional, setIncludeOptional] = useState(false);
  const [aiArchetype, setAiArchetype] = useState<Archetype | null>(null);

  // Prefill from an AI draft handed over by /ai-draft, landing on review.
  const aiDraft = useAiDraftStore((s) => s.draft);
  const clearAiDraft = useAiDraftStore((s) => s.clear);
  useEffect(() => {
    if (!aiDraft) return;
    setTitle(aiDraft.title);
    setHypothesis(aiDraft.hypothesis);
    setMetrics(aiDraft.metrics);
    setPhases(aiDraft.phases);
    setAiArchetype(aiDraft.archetype);
    setStep('review');
    clearAiDraft();
  }, [aiDraft, clearAiDraft]);

  const applyTemplate = (tpl: ExperimentTemplate) => {
    setTemplate(tpl);
    setMetrics(
      tpl.metrics.map((m) => ({
        name: m.name,
        type: m.type,
        config: m.config as NewMetricInput['config'],
        schedule: m.schedule,
        direction: m.direction,
      }))
    );
    setPhases(
      tpl.phases
        .filter((p) => !p.optional)
        .map((p) => ({ type: p.type, label: p.label, plannedDays: p.plannedDays }))
    );
    setIncludeOptional(false);
  };

  const toggleOptionalPhases = () => {
    if (!template) return;
    const next = !includeOptional;
    setIncludeOptional(next);
    setPhases(
      template.phases
        .filter((p) => next || !p.optional)
        .map((p) => ({ type: p.type, label: p.label, plannedDays: p.plannedDays }))
    );
  };

  const applyAlternating = () => {
    if (!template?.alternating) return;
    const built = buildAlternatingPhases(
      'tmp',
      phases[0]?.label ?? 'A',
      phases[1]?.label ?? 'B',
      template.alternating.daysEach,
      template.alternating.rounds,
      () => 'tmp'
    );
    setPhases(built.map((p) => ({ type: p.type, label: p.label, plannedDays: p.plannedDays })));
  };

  const create = useMutation({
    mutationFn: async (start: boolean) => {
      // Starting with no baseline phase records the skip (spec §4.2) — verdict shows a caveat.
      const skipBaseline = start && !phases.some((p) => p.type === 'baseline');
      await createExperiment({
        title: title.trim(),
        hypothesis: hypothesis.trim(),
        archetype: aiArchetype ?? template?.archetype ?? 'custom',
        metrics,
        phases,
        now: Date.now(),
        start,
        skipBaseline,
      });
      const bundles = await getActiveExperiments(Date.now());
      await rescheduleAll(
        bundles.flatMap((b) =>
          b.metrics.map((metric) => ({ metric, experimentTitle: b.experiment.title }))
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['draft-experiments'] });
      router.back();
    },
  });

  const startWithBaselineCheck = () => {
    const hasBaseline = phases.some((p) => p.type === 'baseline');
    if (hasBaseline) {
      create.mutate(true);
      return;
    }
    Alert.alert(
      'No baseline phase',
      'Without a baseline you lose your before/after comparison. The verdict will carry a caveat.',
      [
        { text: 'Add baseline', style: 'cancel', onPress: () => setStep('phases') },
        { text: 'Start anyway', style: 'destructive', onPress: () => create.mutate(true) },
      ]
    );
  };

  const stepIndex = STEPS.indexOf(step);
  const stepValid = (): boolean => {
    switch (step) {
      case 'template':
        return template !== null;
      case 'basics':
        return title.trim().length > 0 && hypothesis.trim().length > 0;
      case 'metrics':
        return metrics.length > 0 && metrics.every((m) => m.name.trim().length > 0);
      case 'phases':
        return (
          phases.length > 0 &&
          phases.every((p) => p.label.trim().length > 0 && p.plannedDays > 0)
        );
      case 'review':
        return true;
    }
  };

  const shortPhases = phases.filter((p) => p.plannedDays > 0 && p.plannedDays < MIN_PHASE_DAYS);

  return (
    <ThemedView style={{ flex: 1 }}>
      {/* progress header */}
      <View style={styles.progressRow}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressSegment,
              {
                backgroundColor: i <= stepIndex ? colors.backgroundSelected : colors.backgroundElement,
              },
            ]}
          />
        ))}
      </View>
      <ThemedText type="subtitle" style={styles.stepTitle}>
        {STEP_TITLES[step]}
      </ThemedText>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'template' && (
          <Pressable
            onPress={() => router.push('/ai-draft' as never)}
            style={[styles.aiButton, { backgroundColor: colors.tintSoft }]}>
            <ThemedText type="smallBold" style={{ color: colors.tint }}>
              ✨ Draft with Claude
            </ThemedText>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              Describe your idea; get metrics, controls, and phases suggested.
            </ThemedText>
          </Pressable>
        )}
        {step === 'template' &&
          TEMPLATES.map((tpl) => (
            <Pressable
              key={tpl.key}
              onPress={() => applyTemplate(tpl)}
              style={[
                styles.templateRow,
                {
                  backgroundColor:
                    template?.key === tpl.key
                      ? colors.backgroundSelected
                      : colors.backgroundElement,
                },
              ]}>
              <ThemedText type="smallBold">
                {TEMPLATE_EMOJI[tpl.key] ?? '🧪'} {tpl.title}
              </ThemedText>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                {tpl.description} · e.g. {tpl.example}
              </ThemedText>
            </Pressable>
          ))}

        {step === 'basics' && (
          <>
            <ThemedText type="smallBold">Title</ThemedText>
            <ThemedView type="backgroundElement" style={styles.inputBox}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Morning vs evening workouts"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.text }]}
              />
            </ThemedView>
            <ThemedText type="smallBold" style={styles.label}>
              Hypothesis
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.inputBox}>
              <TextInput
                value={hypothesis}
                onChangeText={setHypothesis}
                placeholder="I believe [change] will [effect] as measured by [metric]"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.text }]}
                multiline
              />
            </ThemedView>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              A good hypothesis is falsifiable. Name the change, the expected effect, and how
              you'll measure it.
            </ThemedText>
          </>
        )}

        {step === 'metrics' && <MetricEditor metrics={metrics} onChange={setMetrics} />}

        {step === 'phases' && (
          <>
            {template?.phases.some((p) => p.optional) && (
              <Pressable
                onPress={toggleOptionalPhases}
                style={[styles.optionRow, { backgroundColor: colors.backgroundElement }]}>
                <ThemedText type="small">
                  {includeOptional ? '☑' : '☐'} Include optional phases (
                  {template.phases
                    .filter((p) => p.optional)
                    .map((p) => p.label)
                    .join(', ')}
                  )
                </ThemedText>
              </Pressable>
            )}
            {template?.alternating && (
              <Pressable
                onPress={applyAlternating}
                style={[styles.optionRow, { backgroundColor: colors.backgroundElement }]}>
                <ThemedText type="small">
                  Switch to alternating A/B/A/B ({template.alternating.rounds}×
                  {template.alternating.daysEach}d each)
                </ThemedText>
              </Pressable>
            )}
            <PhaseEditor phases={phases} onChange={setPhases} />
          </>
        )}

        {step === 'review' && (
          <>
            <ThemedView type="backgroundElement" style={styles.reviewCard}>
              <ThemedText type="smallBold">{title}</ThemedText>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                {hypothesis}
              </ThemedText>
            </ThemedView>
            <ThemedView type="backgroundElement" style={styles.reviewCard}>
              <ThemedText type="smallBold">Metrics ({metrics.length})</ThemedText>
              {metrics.map((m, i) => (
                <ThemedText key={i} type="small" style={{ color: colors.textSecondary }}>
                  {m.name} — {m.type}
                  {'remindAt' in m.schedule
                    ? ` · reminders ${m.schedule.remindAt.join(', ')}`
                    : ' · on demand'}
                </ThemedText>
              ))}
            </ThemedView>
            <ThemedView type="backgroundElement" style={styles.reviewCard}>
              <ThemedText type="smallBold">Phases</ThemedText>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                {phases.map((p) => `${p.label} ${p.plannedDays}d`).join(' → ')}
              </ThemedText>
              {shortPhases.length > 0 && (
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  ⚠︎ {shortPhases.length} phase(s) under {MIN_PHASE_DAYS} days — conclusions from
                  short phases are weak.
                </ThemedText>
              )}
              {!phases.some((p) => p.type === 'baseline') && (
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  ⚠︎ No baseline phase — the verdict will carry a caveat.
                </ThemedText>
              )}
            </ThemedView>
            <Pressable
              disabled={create.isPending}
              onPress={startWithBaselineCheck}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: pressed
                    ? colors.backgroundSelected
                    : colors.backgroundElement,
                },
              ]}>
              <ThemedText type="smallBold">
                {create.isPending ? 'Working…' : 'Start experiment'}
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={create.isPending}
              onPress={() => create.mutate(false)}
              style={styles.secondaryButton}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                Save as draft
              </ThemedText>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* nav footer */}
      {step !== 'review' && (
        <View style={styles.footer}>
          {stepIndex > 0 ? (
            <Pressable onPress={() => setStep(STEPS[stepIndex - 1])}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                ← Back
              </ThemedText>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            disabled={!stepValid()}
            onPress={() => setStep(STEPS[stepIndex + 1])}
            style={[
              styles.nextButton,
              {
                backgroundColor: colors.backgroundElement,
                opacity: stepValid() ? 1 : 0.4,
              },
            ]}>
            <ThemedText type="smallBold">Next</ThemedText>
          </Pressable>
        </View>
      )}
      {step === 'review' && (
        <View style={styles.footer}>
          <Pressable onPress={() => setStep('phases')}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              ← Back
            </ThemedText>
          </Pressable>
          <View />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  stepTitle: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  templateRow: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  aiButton: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  label: {
    marginTop: Spacing.two,
  },
  inputBox: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  input: {
    minHeight: 44,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  optionRow: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  reviewCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  primaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  nextButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
});
