// Active experiment card on Today: title, phase progress, quick-log rows.

import { StyleSheet, View } from 'react-native';

import { QuickLogRow } from '@/components/quick-log';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { ActiveExperimentBundle } from '@/db/repo';
import { actualDays } from '@/domain/phase-engine';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  bundle: ActiveExperimentBundle;
  now: number;
  onLog: (metricId: string, value: number) => void;
}

export function ExperimentCard({ bundle, now, onLog }: Props) {
  const colors = useTheme();
  const { experiment, activePhase, metrics, todayCounts } = bundle;

  const phaseInfo = activePhase
    ? `${activePhase.label} — day ${actualDays(activePhase, now) + 1} of ${activePhase.plannedDays}`
    : 'All phases done — verdict pending';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{experiment.title}</ThemedText>
      <ThemedText type="small" style={{ color: colors.textSecondary }}>
        {phaseInfo}
      </ThemedText>
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
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
    alignSelf: 'stretch',
  },
  rows: {
    marginTop: Spacing.two,
  },
});
