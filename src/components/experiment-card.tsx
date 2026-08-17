// Active experiment card on Today: title, phase progress, check-in button,
// quick-log rows with clear done states.

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { QuickLogRow } from '@/components/quick-log';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ActiveExperimentBundle } from '@/db/repo';
import { actualDays } from '@/domain/phase-engine';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  bundle: ActiveExperimentBundle;
  now: number;
  onLog: (metricId: string, value: number) => void;
}

export function ExperimentCard({ bundle, now, onLog }: Props) {
  const router = useRouter();
  const colors = useTheme();
  const { experiment, activePhase, metrics, todayCounts } = bundle;

  const phaseInfo = activePhase
    ? `${activePhase.label} — day ${actualDays(activePhase, now) + 1} of ${activePhase.plannedDays}`
    : 'All phases done — verdict pending';

  const scheduled = metrics.filter((m) => 'timesPerDay' in m.schedule);
  const doneCount = scheduled.filter(
    (m) => (todayCounts[m.id] ?? 0) >= ('timesPerDay' in m.schedule ? m.schedule.timesPerDay : 1)
  ).length;
  const allDone = scheduled.length > 0 && doneCount === scheduled.length;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable onPress={() => router.push(`/experiment/${experiment.id}` as never)}>
        <View style={styles.headerRow}>
          <View style={{ flexShrink: 1 }}>
            <ThemedText type="smallBold">{experiment.title} ›</ThemedText>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              {phaseInfo}
            </ThemedText>
          </View>
          {allDone && (
            <View style={[styles.donePill, { backgroundColor: colors.successSoft }]}>
              <ThemedText type="small" style={{ color: colors.success }}>
                ✓ Done today
              </ThemedText>
            </View>
          )}
        </View>
      </Pressable>

      {!allDone && scheduled.length > 0 && (
        <Pressable
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

      <View style={styles.rows}>
        {metrics.map((m) => (
          <QuickLogRow
            key={m.id}
            metric={m}
            loggedToday={todayCounts[m.id] ?? 0}
            onLog={(value) => onLog(m.id, value)}
          />
        ))}
      </View>
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
  donePill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
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
