// "Something happened" — confounder entry sheet (M4).
// Logs a window; overlapping observations get flagged (dimmed in charts,
// excludable from verdict math).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ChipRow } from '@/components/wizard/chips';
import { Spacing } from '@/constants/theme';
import { addConfounder } from '@/db/repo';
import { DAY_MS } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';

type StartChoice = 'now' | 'today' | 'yesterday' | 'two_days';
type EndChoice = 'ongoing' | 'ended';

const START_OFFSETS: Record<StartChoice, (now: number) => number> = {
  now: (now) => now,
  today: (now) => new Date(now).setHours(0, 0, 0, 0),
  yesterday: (now) => new Date(now).setHours(0, 0, 0, 0) - DAY_MS,
  two_days: (now) => new Date(now).setHours(0, 0, 0, 0) - 2 * DAY_MS,
};

export default function ConfounderSheet() {
  const { experimentId } = useLocalSearchParams<{ experimentId: string }>();
  const router = useRouter();
  const colors = useTheme();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [start, setStart] = useState<StartChoice>('today');
  const [end, setEnd] = useState<EndChoice>('ongoing');

  const save = useMutation({
    mutationFn: () => {
      const now = Date.now();
      return addConfounder({
        experimentId,
        note: note.trim(),
        startsAt: START_OFFSETS[start](now),
        endsAt: end === 'ended' ? now : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiment-detail', experimentId] });
      queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
      router.back();
    },
  });

  const valid = note.trim().length > 0;

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="small" style={{ color: colors.textSecondary }}>
        Sick day, travel, terrible sleep, deadline crunch — anything that could contaminate
        observations. Overlapping data gets flagged, and the verdict can exclude it.
      </ThemedText>

      <ThemedView type="backgroundElement" style={styles.inputBox}>
        <TextInput
          autoFocus
          value={note}
          onChangeText={setNote}
          placeholder="What happened? (e.g. Was sick Tue–Thu)"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text }]}
          multiline
        />
      </ThemedView>

      <ThemedText type="smallBold">Started</ThemedText>
      <ChipRow
        options={[
          { value: 'now', label: 'Just now' },
          { value: 'today', label: 'Today' },
          { value: 'yesterday', label: 'Yesterday' },
          { value: 'two_days', label: '2 days ago' },
        ]}
        value={start}
        onChange={setStart}
      />

      <ThemedText type="smallBold">Status</ThemedText>
      <ChipRow
        options={[
          { value: 'ongoing', label: 'Still ongoing' },
          { value: 'ended', label: 'Over now' },
        ]}
        value={end}
        onChange={setEnd}
      />
      {end === 'ongoing' && (
        <ThemedText type="small" style={{ color: colors.textSecondary }}>
          Open windows keep flagging new observations until you close them from the experiment
          screen.
        </ThemedText>
      )}

      <View style={{ flex: 1 }} />
      <Pressable
        disabled={!valid || save.isPending}
        onPress={() => save.mutate()}
        style={({ pressed }) => [
          styles.saveButton,
          {
            backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
            opacity: valid ? 1 : 0.4,
          },
        ]}>
        <ThemedText type="smallBold">Log confounder</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  inputBox: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  input: {
    minHeight: 60,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  saveButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
});
