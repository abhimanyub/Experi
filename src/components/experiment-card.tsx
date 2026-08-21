// Active experiment card on Today: title, phase progress, glass-fill,
// check-in button (today only), quick-log rows, future-start + verdict states.

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlassFill } from '@/components/glass-fill';
import { QuickLogRow } from '@/components/quick-log';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ArchetypeIdentity } from '@/constants/archetypes';
import { Spacing } from '@/constants/theme';
import { ActiveExperimentBundle } from '@/db/repo';
import { actualDays, allPhasesDone } from '@/domain/phase-engine';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  bundle: ActiveExperimentBundle;
  now: number;
  isToday: boolean; // viewing today vs a past day on the date bar
  onLog: (metricId: string, value: number) => void;
  onMiss: (metricId: string) => void;
  undoableMetricId?: string | null; // metric whose latest quick-log can still be taken back
  onUndo?: () => void;
}

export function ExperimentCard({
  bundle,
  now,
  isToday,
  onLog,
  onMiss,
  undoableMetricId,
  onUndo,
}: Props) {
  const router = useRouter();
  const colors = useTheme();
  const { experiment, activePhase, upcomingPhase, phases, metrics, todayCounts, missedCounts } =
    bundle;

  const phaseInfo = activePhase
    ? `${activePhase.label} — day ${actualDays(activePhase, now) + 1} of ${activePhase.plannedDays}`
    : upcomingPhase
      ? `Starts ${new Date(upcomingPhase.startedAt!).toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}`
      : 'All phases done — verdict pending';

  const scheduled = metrics.filter((m) => 'timesPerDay' in m.schedule);
  const doneCount = scheduled.filter(
    (m) => (todayCounts[m.id] ?? 0) >= ('timesPerDay' in m.schedule ? m.schedule.timesPerDay : 1)
  ).length;
  const allDone = scheduled.length > 0 && doneCount === scheduled.length;
  const fillFraction = scheduled.length > 0 ? doneCount / scheduled.length : 0;
  const finished = allPhasesDone(phases);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${experiment.title}, ${phaseInfo}`}
        accessibilityHint="Opens the experiment"
        onPress={() => router.push(`/experiment/${experiment.id}` as never)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <View style={styles.headerRow}>
          <View style={{ flexShrink: 1 }}>
            <ThemedText type="smallBold">
              {ArchetypeIdentity[experiment.archetype].emoji} {experiment.title} ›
            </ThemedText>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              {phaseInfo}
            </ThemedText>
          </View>
          {scheduled.length > 0 && activePhase && (
            <View style={styles.glassCol}>
              <GlassFill
                fraction={fillFraction}
                accessibilityLabel={`${doneCount} of ${scheduled.length} check-ins done`}
              />
              {allDone && (
                <ThemedText type="small" style={{ color: colors.success }}>
                  Full ✓
                </ThemedText>
              )}
            </View>
          )}
        </View>
      </Pressable>

      {finished && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/verdict/${experiment.id}` as never)}
          style={({ pressed }) => [
            styles.checkinButton,
            { backgroundColor: colors.success, opacity: pressed ? 0.85 : 1 },
          ]}>
          <ThemedText type="smallBold" style={{ color: colors.onTint }}>
            Write the verdict
          </ThemedText>
        </Pressable>
      )}

      {isToday && activePhase && !allDone && scheduled.length > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/checkin/${experiment.id}` as never)}
          style={({ pressed }) => [
            styles.checkinButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}>
          <ThemedText type="smallBold" style={{ color: colors.onTint }}>
            Check in · {doneCount}/{scheduled.length} done
          </ThemedText>
        </Pressable>
      )}

      {(activePhase || !isToday) && !upcomingPhase && !finished && (
        <View style={styles.rows}>
          {metrics.map((m) => (
            <QuickLogRow
              key={m.id}
              metric={m}
              loggedToday={todayCounts[m.id] ?? 0}
              missedCount={missedCounts[m.id] ?? 0}
              onLog={(value) => onLog(m.id, value)}
              onMiss={
                !isToday && (todayCounts[m.id] ?? 0) === 0 ? () => onMiss(m.id) : undefined
              }
              onUndo={undoableMetricId === m.id ? onUndo : undefined}
            />
          ))}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  glassCol: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  checkinButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two + 2,
    borderRadius: Spacing.three,
  },
  rows: {
    marginTop: Spacing.one,
  },
});
