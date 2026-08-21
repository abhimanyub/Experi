import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateBar, startOfDay } from '@/components/date-bar';
import { ExperimentCard } from '@/components/experiment-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  deleteDraft,
  deleteObservation,
  getActiveExperiments,
  getActivityDays,
  getDraftExperiments,
  logObservation,
  startDraft,
  syncPhaseTransitions,
} from '@/db/repo';
import { confirmAction } from '@/lib/confirm';
import { rescheduleAll } from '@/lib/notifications';
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

  // Notification permission is requested contextually (when the user first
  // schedules reminders), never here at cold launch.
  useEffect(() => {
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

  const { data: activity = {} } = useQuery({
    queryKey: ['activity-days', bundles.length],
    queryFn: () => getActivityDays(Date.now()),
  });

  // Track the latest quick-log so its row can offer Undo for a few seconds.
  const [lastLogged, setLastLogged] = useState<{ metricId: string; obsId: string } | null>(null);

  const logMutation = useMutation({
    mutationFn: (params: { metricId: string; value: number; missed?: boolean }) =>
      logObservation({ ...params, now: Date.now(), observedAt: observedAtFor() }),
    onSuccess: (obs) => {
      setLastLogged({ metricId: obs.metricId, obsId: obs.id });
      queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['activity-days'] });
    },
  });

  const undoMutation = useMutation({
    mutationFn: (obsId: string) => deleteObservation(obsId),
    onSuccess: () => {
      setLastLogged(null);
      queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['activity-days'] });
    },
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
    if (Platform.OS === 'web') {
      // Alert.alert is a silent no-op on web; window.confirm carries the choice.
      // eslint-disable-next-line no-alert
      const withBaseline = window.confirm(
        'Begin with the baseline phase?\n\nOK starts the baseline first; Cancel skips it (the verdict will carry a caveat).'
      );
      startDraftMutation.mutate({ id, skipBaseline: !withBaseline });
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

          <DateBar now={now} selected={selectedDay} activity={activity} onSelect={setSelectedDay} />

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
              undoableMetricId={lastLogged?.metricId ?? null}
              onUndo={() => lastLogged && undoMutation.mutate(lastLogged.obsId)}
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
                      accessibilityRole="button"
                      accessibilityLabel={`Start ${d.experiment.title}`}
                      onPress={() =>
                        onStartDraft(
                          d.experiment.id,
                          d.phases.some((p) => p.type === 'baseline')
                        )
                      }
                      style={({ pressed }) => [
                        styles.draftButton,
                        { backgroundColor: colors.backgroundSelected, opacity: pressed ? 0.7 : 1 },
                      ]}>
                      <ThemedText type="smallBold">Start</ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete draft ${d.experiment.title}`}
                      hitSlop={8}
                      onPress={async () => {
                        const ok = await confirmAction({
                          title: 'Delete draft?',
                          message: d.experiment.title,
                          confirmText: 'Delete',
                          destructive: true,
                        });
                        if (ok) deleteDraftMutation.mutate(d.experiment.id);
                      }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
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
            accessibilityRole="button"
            onPress={() => router.push('/new' as never)}
            style={({ pressed }) => [
              styles.newButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}>
            <ThemedText type="smallBold" style={{ color: colors.onTint }}>
              + New experiment
            </ThemedText>
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
