// Quick-log sheet for numeric / currency / duration metrics.
// Deep-link target from notifications: /log/[metricId].

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { getMetric, logObservation } from '@/db/repo';
import { CurrencyConfig, DurationConfig, NumericConfig } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';

export default function LogSheet() {
  const { metricId } = useLocalSearchParams<{ metricId: string }>();
  const router = useRouter();
  const colors = useTheme();
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');

  const { data: metric } = useQuery({
    queryKey: ['metric', metricId],
    queryFn: () => getMetric(metricId),
  });

  const save = useMutation({
    mutationFn: (value: number) =>
      logObservation({ metricId, value, note: note.trim() || undefined, now: Date.now() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
      router.back();
    },
  });

  if (!metric) return <ThemedView style={styles.container} />;

  const unit =
    metric.type === 'currency'
      ? (metric.config as CurrencyConfig).code
      : metric.type === 'duration'
        ? (metric.config as DurationConfig).unit
        : ((metric.config as NumericConfig).unit ?? '');

  const value = Number(raw.replace(',', '.'));
  const valid = raw.trim() !== '' && Number.isFinite(value);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">{metric.name}</ThemedText>
        <ThemedView type="backgroundElement" style={styles.inputRow}>
          <TextInput
            autoFocus
            keyboardType="decimal-pad"
            value={raw}
            onChangeText={setRaw}
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, fontFamily: Fonts?.mono }]}
          />
          {unit ? (
            <ThemedText type="default" style={{ color: colors.textSecondary }}>
              {unit}
            </ThemedText>
          ) : null}
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.noteBox}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={colors.textSecondary}
            style={[styles.note, { color: colors.text }]}
            multiline
          />
        </ThemedView>
        <Pressable
          disabled={!valid || save.isPending}
          onPress={() => save.mutate(value)}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
              opacity: valid ? 1 : 0.4,
            },
          ]}>
          <ThemedText type="smallBold">Save</ThemedText>
        </Pressable>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  input: {
    flex: 1,
    fontSize: 32,
    paddingVertical: Spacing.three,
  },
  noteBox: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  note: {
    minHeight: 60,
    paddingVertical: Spacing.two,
  },
  saveButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
});
