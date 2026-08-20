import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateBar, startOfDay } from '@/components/date-bar';
import { ExperimentCard } from '@/components/experiment-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  deleteDraft,
  getActiveExperiments,
  getDraftExperiments,
  logObservation,
  startDraft,
  syncPhaseTransitions,
} from '@/db/repo';
import { ensureNotificationSetup, rescheduleAll } from '@/lib/notifications';
import { useTheme } from '@/hooks/use-theme';

export default function TodayScreen() {
  const router = useRouter();
  const colors = useTheme();
  const queryClient = useQueryClient();
  const now = Date.now();
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(Date.now()));
  const isToday = selectedDay === startOfDay(now);
  // Log at "now" for today; midday for a past day (clearly backdated, phase-resolved).
  const observedAtFor = () => (isToday ? Date.now() : selectedDay + 12 * 60 * 60 * 1000);

  useEffect(() => {
    ensureNotificationSetup();
    syncPhaseTransitions(Date.now()).then((n) => {
      if (n > 0) queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
    });
  }, [queryClient]);

  const { data: bundles = [], isLoading } = useQuery({
    queryKey: ['active-experiments', selectedDay],
    queryFn: () => getActiveExperiments(Date.now(), selectedDay),
  });

  // Keep local reminders in sync with whatever is currently active —
  // covers app reinstalls, phase endings, abandons, and completed experiments.
  useEffect(() => {
    if (isLoading) return;
    rescheduleAll(
      bundles
        .filter((b) => b.activePhase !== null)
        .flatMap((b) =>
          b.metrics.map((metric) => ({ metric, experimentTitle: b.experiment.title }))
        )
    );
  }, [bundles, isLoading]);

  const { data: drafts = [] } = useQuery({
    queryKey: ['draft-experiments'],
    queryFn: getDraftExperiments,
  });

  const logMutation = useMutation({
    mutationFn: (params: { metricId: string; value: number; missed?: boolean }) =>
      logObservation({ ...params, now: Date.now(), observedAt: observedAtFor() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['active-experiments'] }),
    onError: (e) =>
      Alert.alert('Could not log', e instanceof Error ? e.message : 'Something went wrong.'),
  });

  const refreshBoth = () => {
    queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
    queryClient.invalidateQueries({ queryKey: ['draft-experiments'] });
  };

  const startDraftMutation = useMutation({
    mutationFn: (params: { id: string; skipBaseline: boolean }) =>
      startDraft(params.id, Date.now(), { skipBaseline: params.skipBaseline }),
    onSuccess: refreshBoth,
  });

  const deleteDraftMutation = useMutation({
    mutationFn: (id: string) => deleteDraft(id),
    onSuccess: refreshBoth,
  });

  const onStartDraft = (id: string, hasBaseline: boolean) => {
    if (!hasBaseline) {
      startDraftMutation.mutate({ id, skipBaseline: true });
      return;
    }
    Alert.alert('Start experiment', 'Begin with the baseline phase?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Skip baseline',
        style: 'destructive',
        onPress: () => startDraftMutation.mutate({ id, skipBaseline: true }),
      },
      {
        text: 'Start baseline',
        onPress: () => startDraftMutation.mutate({ id, skipBaseline: false }),
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={{ alignSelf: 'stretch' }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.heading}>
            <ThemedText type="title">{isToday ? 'Today' : 'Catch up'}</ThemedText>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              {new Date(selectedDay).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </ThemedText>
          </View>

          <DateBar now={now} selected={selectedDay} onSelect={setSelectedDay} />

          {bundles.length === 0 && !isLoading && (
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText style={styles.emptyEmoji}>🥤</ThemedText>
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
              isToday={isToday}
              onLog={(metricId, value) => logMutation.mutate({ metricId, value })}
              onMiss={(metricId) => logMutation.mutate({ metricId, value: 0, missed: true })}
            />
          ))}

          {drafts.length > 0 && (
            <>
              <ThemedText type="smallBold" style={{ color: colors.textSecondary }}>
                Drafts
              </ThemedText>
              {drafts.map((d) => (
                <ThemedView
                  key={d.experiment.id}
                  type="backgroundElement"
                  style={styles.draftCard}>
                  <View style={{ flexShrink: 1, gap: Spacing.half }}>
                    <ThemedText type="smallBold">{d.experiment.title}</ThemedText>
                    <ThemedText type="small" style={{ color: colors.textSecondary }}>
                      {d.phases.map((p) => `${p.label} ${p.plannedDays}d`).join(' → ')}
                    </ThemedText>
                  </View>
                  <View style={styles.draftActions}>
                    <Pressable
                      onPress={() =>
                        onStartDraft(
                          d.experiment.id,
                          d.phases.some((p) => p.type === 'baseline')
                        )
                      }
                      style={[styles.draftButton, { backgroundColor: colors.backgroundSelected }]}>
                      <ThemedText type="smallBold">Start</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Alert.alert('Delete draft?', d.experiment.title, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => deleteDraftMutation.mutate(d.experiment.id),
                          },
                        ])
                      }>
                      <ThemedText type="small" style={{ color: colors.textSecondary }}>
                        Delete
                      </ThemedText>
                    </Pressable>
                  </View>
                </ThemedView>
              ))}
            </>
          )}

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
    paddingTop: Platform.OS === 'web' ? 72 : Spacing.three, // clear the floating web tab bar
  },
  heading: {
    marginBottom: Spacing.one,
    gap: Spacing.half,
  },
  empty: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 56,
    lineHeight: 68,
  },
  emptyQuote: {
    fontStyle: 'italic',
    textAlign: 'center',
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
  draftCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  draftActions: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  draftButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
});
