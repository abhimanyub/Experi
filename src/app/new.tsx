// New experiment wizard (M3, spec §7.3):
// template → hypothesis → metrics → phases → review. Start now or save as draft.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

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
import { confirmAction, showError } from '@/lib/confirm';
import { successFeedback } from '@/lib/haptics';
import { ensureNotificationSetup, rescheduleAll } from '@/lib/notifications';
import { ChipRow } from '@/components/wizard/chips';
import { MetricEditor } from '@/components/wizard/metric-editor';
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
  const navigation = useNavigation();
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
  const [baselineMode, setBaselineMode] = useState<'phase' | 'current'>('phase');
  const [startWhen, setStartWhen] = useState<'now' | 'tomorrow' | 'in2days'>('now');

  // A swipe-down or back gesture on the modal shouldn't silently eat typed
  // work. Saving (draft or start) sets doneRef so the guard steps aside.
  const doneRef = useRef(false);
  const dirtyRef = useRef(false);
  dirtyRef.current =
    !doneRef.current &&
    (title.trim().length > 0 || hypothesis.trim().length > 0 || template !== null);
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      // doneRef is checked directly: a successful save navigates back in the
      // same tick it sets the flag, before any re-render updates dirtyRef.
      if (doneRef.current || !dirtyRef.current) return;
      e.preventDefault();
      confirmAction({
        title: 'Discard this experiment?',
        message: 'Nothing has been saved yet. You can also save it as a draft from Review.',
        confirmText: 'Discard',
        destructive: true,
      }).then((ok) => {
        if (ok) navigation.dispatch(e.data.action);
      });
    });
    return () => sub();
  }, [navigation]);

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

  /** 9:00 local on the chosen future morning. */
  const resolveStartAt = (): number | undefined => {
    if (startWhen === 'now') return undefined;
    const d = new Date();
    d.setDate(d.getDate() + (startWhen === 'tomorrow' ? 1 : 2));
    d.setHours(9, 0, 0, 0);
    return d.getTime();
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
        startAt: resolveStartAt(),
      });
      // The moment reminders become real is the right moment to ask for
      // notification permission — with the experiment as visible context.
      const wantsReminders = metrics.some(
        (m) => 'remindAt' in m.schedule && m.schedule.remindAt.length > 0
      );
      let remindersBlocked = false;
      if (start && wantsReminders && Platform.OS !== 'web') {
        remindersBlocked = !(await ensureNotificationSetup());
      }
      const bundles = await getActiveExperiments(Date.now());
      await rescheduleAll(
        bundles.flatMap((b) =>
          b.metrics.map((metric) => ({ metric, experimentTitle: b.experiment.title }))
        )
      );
      return { remindersBlocked };
    },
    onSuccess: ({ remindersBlocked }) => {
      doneRef.current = true;
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['draft-experiments'] });
      router.back();
      if (remindersBlocked) {
        showError(
          'Reminders are off',
          'The experiment started, but notifications are disabled for this app — reminder times won’t fire. Enable notifications in Settings to get them.'
        );
      }
    },
  });

  const startWithBaselineCheck = () => {
    const hasBaseline = phases.some((p) => p.type === 'baseline');
    // "Current state is my baseline" was an explicit choice — no nagging alert.
    if (hasBaseline || baselineMode === 'current') {
      create.mutate(true);
      return;
    }
    if (Platform.OS === 'web') {
      // Alert.alert is a silent no-op on web — same warning, two choices.
      confirmAction({
        title: 'No baseline phase',
        message:
          'Without a baseline you lose your before/after comparison. The verdict will carry a caveat.',
        confirmText: 'Start anyway',
        destructive: true,
      }).then((ok) => (ok ? create.mutate(true) : setStep('phases')));
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

  const setBaseline = (mode: 'phase' | 'current') => {
    setBaselineMode(mode);
    if (mode === 'current') {
      setPhases(phases.filter((p) => p.type !== 'baseline'));
    } else if (!phases.some((p) => p.type === 'baseline')) {
      setPhases([{ type: 'baseline', label: 'Baseline', plannedDays: 7 }, ...phases]);
    }
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
    <ThemedView style={{ flex: 1 }}>
      {/* progress header */}
      <View
        style={styles.progressRow}
        accessibilityRole="progressbar"
        accessibilityLabel="Wizard progress"
        accessibilityValue={{ min: 0, max: STEPS.length, now: stepIndex + 1 }}>
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
        <Animated.View
          key={step}
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={styles.stepContent}>
        {step === 'template' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/ai-draft' as never)}
            style={({ pressed }) => [
              styles.aiButton,
              { backgroundColor: colors.tintSoft, opacity: pressed ? 0.7 : 1 },
            ]}>
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
              accessibilityRole="button"
              accessibilityState={{ selected: template?.key === tpl.key }}
              onPress={() => applyTemplate(tpl)}
              style={({ pressed }) => [
                styles.templateRow,
                {
                  backgroundColor:
                    template?.key === tpl.key || pressed
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
            <ThemedText type="smallBold">Baseline</ThemedText>
            <ChipRow
              options={[
                { value: 'phase', label: 'Track a baseline first' },
                { value: 'current', label: 'Current state is my baseline' },
              ]}
              value={baselineMode}
              onChange={setBaseline}
            />
            {baselineMode === 'current' && (
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                You start the change on day one and compare against how life feels from here.
                Honest, but weaker than a measured before-picture.
              </ThemedText>
            )}
            {template?.phases.some((p) => p.optional) && (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: includeOptional }}
                onPress={toggleOptionalPhases}
                style={({ pressed }) => [
                  styles.optionRow,
                  {
                    backgroundColor: pressed
                      ? colors.backgroundSelected
                      : colors.backgroundElement,
                  },
                ]}>
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
                accessibilityRole="button"
                onPress={applyAlternating}
                style={({ pressed }) => [
                  styles.optionRow,
                  {
                    backgroundColor: pressed
                      ? colors.backgroundSelected
                      : colors.backgroundElement,
                  },
                ]}>
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
                  {baselineMode === 'current'
                    ? 'Using your current state as the baseline.'
                    : '⚠︎ No baseline phase — the verdict will carry a caveat.'}
                </ThemedText>
              )}
            </ThemedView>

            <ThemedText type="smallBold">Starts</ThemedText>
            <ChipRow
              options={[
                { value: 'now', label: 'Now' },
                { value: 'tomorrow', label: 'Tomorrow 9:00' },
                { value: 'in2days', label: `In 2 days` },
              ]}
              value={startWhen}
              onChange={setStartWhen}
            />

            <Pressable
              accessibilityRole="button"
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
                {create.isPending
                  ? 'Working…'
                  : startWhen === 'now'
                    ? 'Start experiment'
                    : 'Schedule experiment'}
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={create.isPending}
              onPress={() => create.mutate(false)}
              style={({ pressed }) => [styles.secondaryButton, { opacity: pressed ? 0.6 : 1 }]}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                Save as draft
              </ThemedText>
            </Pressable>
          </>
        )}
        </Animated.View>
      </ScrollView>

      {/* nav footer */}
      {step !== 'review' && (
        <View style={styles.footer}>
          {stepIndex > 0 ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setStep(STEPS[stepIndex - 1])}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                ← Back
              </ThemedText>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            accessibilityRole="button"
            disabled={!stepValid()}
            onPress={() => setStep(STEPS[stepIndex + 1])}
            style={({ pressed }) => [
              styles.nextButton,
              {
                backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
                opacity: stepValid() ? 1 : 0.4,
              },
            ]}>
            <ThemedText type="smallBold">Next</ThemedText>
          </Pressable>
        </View>
      )}
      {step === 'review' && (
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setStep('phases')}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              ← Back
            </ThemedText>
          </Pressable>
          <View />
        </View>
      )}
    </ThemedView>
    </KeyboardAvoidingView>
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
  },
  stepContent: {
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
