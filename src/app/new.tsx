// New experiment (redesign): the five-step wizard collapsed into one
// scrolling build sheet — template chips, a fill-in-the-blanks hypothesis,
// the metric list, phase rows with day steppers, then Start.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useNavigation, useRouter } from 'expo-router';
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

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { phaseColor } from '@/constants/viz';
import { createExperiment, getActiveExperiments, NewMetricInput, NewPhaseInput } from '@/db/repo';
import { TEMPLATE_EMOJI } from '@/constants/archetypes';
import { Archetype, MIN_PHASE_DAYS } from '@/domain/types';
import { useAiDraftStore } from '@/lib/ai-draft-store';
import { confirmAction, showError } from '@/lib/confirm';
import { successFeedback, tapFeedback } from '@/lib/haptics';
import { ensureNotificationSetup, rescheduleAll } from '@/lib/notifications';
import { ChipRow } from '@/components/wizard/chips';
import { MetricEditor } from '@/components/wizard/metric-editor';
import { ExperimentTemplate, TEMPLATES } from '@/templates';
import { useTheme } from '@/hooks/use-theme';

/** Split a legacy hypothesis back into madlib slots (AI drafts hand us prose). */
function slotsFromHypothesis(h: string): [string, string, string] | null {
  const m = /^I believe (.+) will (.+) as measured by (.+?)\.?$/i.exec(h.trim());
  return m ? [m[1], m[2], m[3]] : null;
}

export default function NewExperimentSheet() {
  const router = useRouter();
  const navigation = useNavigation();
  const colors = useTheme();
  const queryClient = useQueryClient();

  const [template, setTemplate] = useState<ExperimentTemplate | null>(null);
  const [change, setChange] = useState('');
  const [effect, setEffect] = useState('');
  const [measure, setMeasure] = useState('');
  const [freeHypothesis, setFreeHypothesis] = useState<string | null>(null); // AI drafts that don't parse
  const [freeTitle, setFreeTitle] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<NewMetricInput[]>([]);
  const [phases, setPhases] = useState<NewPhaseInput[]>([]);
  const [aiArchetype, setAiArchetype] = useState<Archetype | null>(null);
  const [startWhen, setStartWhen] = useState<'now' | 'tomorrow' | 'in2days'>('now');

  const title =
    freeTitle ??
    (change.trim() ? change.trim().charAt(0).toUpperCase() + change.trim().slice(1) : '');
  const hypothesis =
    freeHypothesis ??
    (change.trim() && effect.trim() && measure.trim()
      ? `I believe ${change.trim()} will ${effect.trim()} as measured by ${measure.trim()}.`
      : '');

  // A swipe-down shouldn't silently eat typed work.
  const doneRef = useRef(false);
  const dirtyRef = useRef(false);
  dirtyRef.current =
    !doneRef.current && (change.trim().length > 0 || template !== null || freeHypothesis !== null);
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (doneRef.current || !dirtyRef.current) return;
      e.preventDefault();
      confirmAction({
        title: 'Discard this experiment?',
        message: 'Nothing has been saved yet. You can also save it as a draft below.',
        confirmText: 'Discard',
        destructive: true,
      }).then((ok) => {
        if (ok) navigation.dispatch(e.data.action);
      });
    });
    return () => sub();
  }, [navigation]);

  // Prefill from an AI draft handed over by /ai-draft.
  const aiDraft = useAiDraftStore((s) => s.draft);
  const clearAiDraft = useAiDraftStore((s) => s.clear);
  useEffect(() => {
    if (!aiDraft) return;
    const slots = slotsFromHypothesis(aiDraft.hypothesis);
    if (slots) {
      setChange(slots[0]);
      setEffect(slots[1]);
      setMeasure(slots[2]);
    } else {
      setFreeHypothesis(aiDraft.hypothesis);
    }
    setFreeTitle(aiDraft.title);
    setMetrics(aiDraft.metrics);
    setPhases(aiDraft.phases);
    setAiArchetype(aiDraft.archetype);
    clearAiDraft();
  }, [aiDraft, clearAiDraft]);

  const applyTemplate = (tpl: ExperimentTemplate) => {
    tapFeedback();
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
        title,
        hypothesis,
        archetype: aiArchetype ?? template?.archetype ?? 'custom',
        metrics,
        phases,
        now: Date.now(),
        start,
        skipBaseline,
        startAt: resolveStartAt(),
      });
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
    if (hasBaseline) {
      create.mutate(true);
      return;
    }
    if (Platform.OS === 'web') {
      confirmAction({
        title: 'No baseline phase',
        message:
          'Without a baseline you lose your before/after comparison. The verdict will carry a caveat.',
        confirmText: 'Start anyway',
        destructive: true,
      }).then((ok) => ok && create.mutate(true));
      return;
    }
    Alert.alert(
      'No baseline phase',
      'Without a baseline you lose your before/after comparison. The verdict will carry a caveat.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start anyway', style: 'destructive', onPress: () => create.mutate(true) },
      ]
    );
  };

  const updatePhase = (i: number, patch: Partial<NewPhaseInput>) => {
    const next = [...phases];
    next[i] = { ...next[i], ...patch };
    setPhases(next);
  };

  const totalDays = phases.reduce((a, p) => a + Math.max(0, p.plannedDays), 0);
  const shortPhases = phases.filter((p) => p.plannedDays > 0 && p.plannedDays < MIN_PHASE_DAYS);
  const valid =
    title.trim().length > 0 &&
    hypothesis.trim().length > 0 &&
    metrics.length > 0 &&
    metrics.every((m) => m.name.trim().length > 0) &&
    phases.length > 0 &&
    phases.every((p) => p.label.trim().length > 0 && p.plannedDays > 0);

  const slotStyle = [
    styles.slot,
    { color: colors.tint, borderBottomColor: 'rgba(224,87,74,0.6)' },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen
          options={{
            title: '',
            headerLeft: () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => router.back()}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <ThemedText type="link" style={{ color: colors.tint }}>
                  Close
                </ThemedText>
              </Pressable>
            ),
          }}
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={{ fontSize: 40, lineHeight: 42 }}>
            New{'\n'}experiment
          </ThemedText>
          <ThemedText type="default" style={{ color: colors.textSecondary, fontSize: 15 }}>
            One sheet. Fill it in, start today.
          </ThemedText>

          <ThemedText type="label" style={styles.section}>
            Template
          </ThemedText>
          <View style={styles.chipWrap}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/ai-draft' as never)}
              style={({ pressed }) => [
                styles.tplChip,
                {
                  backgroundColor: colors.tintSoft,
                  borderColor: 'rgba(224,87,74,0.3)',
                  transform: [{ scale: pressed ? 0.93 : 1 }],
                },
              ]}>
              <ThemedText type="smallBold" style={{ color: colors.tint }}>
                ✨ Draft with Claude
              </ThemedText>
            </Pressable>
            {TEMPLATES.map((tpl) => {
              const on = template?.key === tpl.key;
              return (
                <Pressable
                  key={tpl.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => applyTemplate(tpl)}
                  style={({ pressed }) => [
                    styles.tplChip,
                    {
                      backgroundColor: on ? colors.cream : 'rgba(255,255,255,0.055)',
                      borderColor: on ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)',
                      transform: [{ scale: pressed ? 0.93 : 1 }],
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: on ? colors.onCream : colors.textSecondary }}>
                    {TEMPLATE_EMOJI[tpl.key] ?? '🧪'} {tpl.title}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="label" style={styles.section}>
            Hypothesis
          </ThemedText>
          <ThemedView
            type="backgroundElement"
            style={[styles.card, { borderColor: colors.cardBorder }]}>
            {freeHypothesis !== null ? (
              <TextInput
                value={freeHypothesis}
                onChangeText={setFreeHypothesis}
                multiline
                accessibilityLabel="Hypothesis"
                style={[styles.madlibText, { color: colors.text, padding: 0 }]}
              />
            ) : (
              <View style={styles.madlib}>
                <ThemedText style={styles.madlibText}>I believe </ThemedText>
                <TextInput
                  value={change}
                  onChangeText={setChange}
                  placeholder="the change"
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel="The change"
                  style={slotStyle}
                />
                <ThemedText style={styles.madlibText}> will </ThemedText>
                <TextInput
                  value={effect}
                  onChangeText={setEffect}
                  placeholder="the effect"
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel="The expected effect"
                  style={slotStyle}
                />
                <ThemedText style={styles.madlibText}> as measured by </ThemedText>
                <TextInput
                  value={measure}
                  onChangeText={setMeasure}
                  placeholder="the measure"
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel="How you'll measure it"
                  style={slotStyle}
                />
                <ThemedText style={styles.madlibText}>.</ThemedText>
              </View>
            )}
          </ThemedView>
          <ThemedText type="small" style={{ color: colors.textSecondary }}>
            A good hypothesis is falsifiable. Name the change, the expected effect, and how you’ll
            measure it.
          </ThemedText>

          <ThemedText type="label" style={styles.section}>
            Metrics
          </ThemedText>
          <MetricEditor metrics={metrics} onChange={setMetrics} />

          <ThemedText type="label" style={styles.section}>
            Phases
          </ThemedText>
          <ThemedView
            type="backgroundElement"
            style={[styles.phaseCard, { borderColor: colors.cardBorder }]}>
            {phases.map((p, i) => (
              <View
                key={i}
                style={[
                  styles.phaseRow,
                  i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
                ]}>
                <View style={[styles.phaseBadge, { backgroundColor: `${phaseColor('dark', i)}26` }]}>
                  <ThemedText type="smallBold" style={{ fontSize: 13, color: phaseColor('dark', i) }}>
                    {String.fromCharCode(65 + i)}
                  </ThemedText>
                </View>
                <TextInput
                  value={p.label}
                  onChangeText={(label) => updatePhase(i, { label })}
                  placeholder="Phase label"
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel={`Phase ${i + 1} label`}
                  style={[styles.phaseLabelInput, { color: colors.text }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Fewer days for ${p.label || `phase ${i + 1}`}`}
                  hitSlop={6}
                  onPress={() => updatePhase(i, { plannedDays: Math.max(1, p.plannedDays - 1) })}
                  style={({ pressed }) => [
                    styles.stepBtn,
                    { backgroundColor: 'rgba(255,255,255,0.07)', transform: [{ scale: pressed ? 0.85 : 1 }] },
                  ]}>
                  <ThemedText type="smallBold">−</ThemedText>
                </Pressable>
                <ThemedText type="smallBold" style={styles.dayCount}>
                  {p.plannedDays}d
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`More days for ${p.label || `phase ${i + 1}`}`}
                  hitSlop={6}
                  onPress={() => updatePhase(i, { plannedDays: Math.min(30, p.plannedDays + 1) })}
                  style={({ pressed }) => [
                    styles.stepBtn,
                    { backgroundColor: 'rgba(255,255,255,0.07)', transform: [{ scale: pressed ? 0.85 : 1 }] },
                  ]}>
                  <ThemedText type="smallBold">+</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${p.label || `phase ${i + 1}`}`}
                  hitSlop={10}
                  onPress={() => setPhases(phases.filter((_, j) => j !== i))}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                  <ThemedText type="small" style={{ color: colors.textFaint }}>
                    ✕
                  </ThemedText>
                </Pressable>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setPhases([...phases, { type: 'intervention', label: '', plannedDays: 7 }])
              }
              style={({ pressed }) => [
                styles.addPhase,
                phases.length > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
                { opacity: pressed ? 0.6 : 1 },
              ]}>
              <ThemedText type="smallBold" style={{ color: colors.tint }}>
                + Add phase
              </ThemedText>
            </Pressable>
          </ThemedView>
          {shortPhases.length > 0 && (
            <ThemedText type="small" style={{ color: colors.warning }}>
              ⚠︎ {shortPhases.length} phase(s) under {MIN_PHASE_DAYS} days — conclusions from short
              phases are weak.
            </ThemedText>
          )}
          {!phases.some((p) => p.type === 'baseline') && phases.length > 0 && (
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              No baseline phase — the verdict will carry a caveat.
            </ThemedText>
          )}
          {totalDays > 0 && (
            <ThemedText
              type="smallBold"
              style={{ textAlign: 'center', fontSize: 13, color: colors.textFaint }}>
              {totalDays} days total · verdict on day {totalDays}
            </ThemedText>
          )}

          <ThemedText type="label" style={styles.section}>
            Starts
          </ThemedText>
          <ChipRow
            options={[
              { value: 'now', label: 'Now' },
              { value: 'tomorrow', label: 'Tomorrow 9:00' },
              { value: 'in2days', label: 'In 2 days' },
            ]}
            value={startWhen}
            onChange={setStartWhen}
          />

          <Pressable
            accessibilityRole="button"
            disabled={!valid || create.isPending}
            onPress={startWithBaselineCheck}
            style={({ pressed }) => [
              styles.startButton,
              {
                backgroundColor: valid ? colors.cream : 'rgba(255,255,255,0.05)',
                transform: [{ scale: pressed && valid ? 0.94 : 1 }],
              },
            ]}>
            <ThemedText
              type="smallBold"
              style={{ fontSize: 17, lineHeight: 22, color: valid ? colors.onCream : colors.textFaint }}>
              {create.isPending
                ? 'Working…'
                : !valid
                  ? 'Fill in the sheet to start'
                  : startWhen === 'now'
                    ? 'Start experiment →'
                    : 'Schedule experiment →'}
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!valid || create.isPending}
            onPress={() => create.mutate(false)}
            style={({ pressed }) => [styles.draftButton, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              Save as draft
            </ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: 10,
  },
  section: {
    marginTop: Spacing.three,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tplChip: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    minHeight: 40,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  madlib: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  madlibText: {
    fontSize: 20,
    lineHeight: 34,
    fontWeight: 500,
  },
  slot: {
    fontSize: 20,
    lineHeight: 34,
    fontWeight: 700,
    borderBottomWidth: 2.5,
    minWidth: 90,
    paddingVertical: 0,
    paddingHorizontal: 2,
  },
  phaseCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  phaseBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseLabelInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: 600,
    paddingVertical: Spacing.one,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCount: {
    width: 36,
    textAlign: 'center',
    fontSize: 15,
  },
  addPhase: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  startButton: {
    marginTop: Spacing.three,
    alignItems: 'center',
    paddingVertical: 17,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  draftButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
});
