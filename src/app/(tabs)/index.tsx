import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExperimentCard } from '@/components/experiment-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { getActiveExperiments, logObservation, syncPhaseTransitions } from '@/db/repo';
import { ensureNotificationSetup } from '@/lib/notifications';
import { useTheme } from '@/hooks/use-theme';

export default function TodayScreen() {
  const router = useRouter();
  const colors = useTheme();
  const queryClient = useQueryClient();
  const now = Date.now();

  useEffect(() => {
    ensureNotificationSetup();
    syncPhaseTransitions(Date.now()).then((n) => {
      if (n > 0) queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
    });
  }, [queryClient]);

  const { data: bundles = [], isLoading } = useQuery({
    queryKey: ['active-experiments'],
    queryFn: () => getActiveExperiments(Date.now()),
  });

  const logMutation = useMutation({
    mutationFn: (params: { metricId: string; value: number }) =>
      logObservation({ ...params, now: Date.now() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['active-experiments'] }),
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={{ alignSelf: 'stretch' }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <ThemedText type="title" style={styles.heading}>
            Today
          </ThemedText>

          {bundles.length === 0 && !isLoading && (
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText type="smallBold" style={styles.emptyQuote}>
                “The first principle is that you must not fool yourself — and you are the easiest
                person to fool.”
              </ThemedText>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                — Richard Feynman
              </ThemedText>
              <ThemedText type="small" style={[styles.emptyHint, { color: colors.textSecondary }]}>
                No active experiments. Start one to settle a personal debate with data.
              </ThemedText>
            </ThemedView>
          )}

          {bundles.map((b) => (
            <ExperimentCard
              key={b.experiment.id}
              bundle={b}
              now={now}
              onLog={(metricId, value) => logMutation.mutate({ metricId, value })}
            />
          ))}

          <Pressable
            onPress={() => router.push('/new' as never)}
            style={({ pressed }) => [
              styles.newButton,
              { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
            ]}>
            <ThemedText type="smallBold">+ New experiment</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    paddingTop: Spacing.three,
  },
  heading: {
    marginBottom: Spacing.one,
  },
  empty: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  emptyQuote: {
    fontStyle: 'italic',
  },
  emptyHint: {
    marginTop: Spacing.two,
  },
  newButton: {
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
});
