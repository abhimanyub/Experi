// Mini creation flow (M2 dogfood path; full wizard lands in M3):
// pick template → title + hypothesis → starts immediately with template defaults.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { createFromTemplate } from '@/db/repo';
import { getActiveExperiments } from '@/db/repo';
import { rescheduleAll } from '@/lib/notifications';
import { ExperimentTemplate, TEMPLATES } from '@/templates';
import { useTheme } from '@/hooks/use-theme';

export default function NewExperimentScreen() {
  const router = useRouter();
  const colors = useTheme();
  const queryClient = useQueryClient();

  const [template, setTemplate] = useState<ExperimentTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      await createFromTemplate({
        template: template!,
        title: title.trim(),
        hypothesis: hypothesis.trim(),
        now: Date.now(),
      });
      // Reschedule reminders from the full active set.
      const bundles = await getActiveExperiments(Date.now());
      await rescheduleAll(
        bundles.flatMap((b) =>
          b.metrics.map((metric) => ({ metric, experimentTitle: b.experiment.title }))
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
      router.back();
    },
  });

  const valid = template && title.trim().length > 0 && hypothesis.trim().length > 0;

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="smallBold">Template</ThemedText>
        {TEMPLATES.map((tpl) => (
          <Pressable
            key={tpl.key}
            onPress={() => setTemplate(tpl)}
            style={[
              styles.templateRow,
              {
                backgroundColor:
                  template?.key === tpl.key ? colors.backgroundSelected : colors.backgroundElement,
              },
            ]}>
            <ThemedText type="smallBold">{tpl.title}</ThemedText>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              {tpl.description} · e.g. {tpl.example}
            </ThemedText>
          </Pressable>
        ))}

        <ThemedText type="smallBold" style={styles.label}>
          Title
        </ThemedText>
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

        <Pressable
          disabled={!valid || create.isPending}
          onPress={() => create.mutate()}
          style={({ pressed }) => [
            styles.startButton,
            {
              backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
              opacity: valid ? 1 : 0.4,
            },
          ]}>
          <ThemedText type="smallBold">
            {create.isPending ? 'Starting…' : 'Start experiment'}
          </ThemedText>
        </Pressable>
        {template && (
          <ThemedText type="small" style={{ color: colors.textSecondary }}>
            Starts now with template phases ({template.phases.filter((p) => !p.optional).map((p) => `${p.label} ${p.plannedDays}d`).join(' → ')}). Editing phases/metrics arrives with the full wizard.
          </ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  templateRow: {
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
  },
  startButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
});
