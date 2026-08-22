// Active experiment card (redesign): phase chip + Bricolage title, day-dot
// strip, self-drawing sparkline, then either the cream Check-in CTA or the
// green "Checked in" state. Past days (catch-up) fall back to quick-log rows.

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { DayDots } from '@/components/day-dots';
import { QuickLogRow } from '@/components/quick-log';
import { Sparkline } from '@/components/sparkline';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ActiveExperimentBundle } from '@/db/repo';
import { ScaleConfig } from '@/domain/types';
import { actualDays, allPhasesDone } from '@/domain/phase-engine';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  bundle: ActiveExperimentBundle;
  now: number;
  isToday: boolean; // viewing today vs a past day on the date bar
  onLog: (metricId: string, value: number) => void;
  onMiss: (metricId: string) => void;
  undoableMetricId?: string | null;
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
  const { width: windowWidth } = useWindowDimensions();
  const { experiment, activePhase, upcomingPhase, phases, metrics, todayCounts, missedCounts } =
    bundle;

  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence);
  const activeIdx = activePhase ? ordered.findIndex((p) => p.id === activePhase.id) : -1;
  const daysBefore = activeIdx > 0 ? ordered.slice(0, activeIdx).reduce((a, p) => a + p.plannedDays, 0) : 0;
  const dayInPhase = activePhase ? actualDays(activePhase, now) : 0;

  const scheduled = metrics.filter((m) => 'timesPerDay' in m.schedule);
  const doneCount = scheduled.filter(
    (m) => (todayCounts[m.id] ?? 0) >= ('timesPerDay' in m.schedule ? m.schedule.timesPerDay : 1)
  ).length;
  const allDone = scheduled.length > 0 && doneCount === scheduled.length;
  const finished = allPhasesDone(phases);

  const chip = activePhase
    ? `Phase ${activePhase.label} · day ${dayInPhase + 1} of ${activePhase.plannedDays}`
    : upcomingPhase
      ? `Starts ${new Date(upcomingPhase.startedAt!).toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}`
      : 'All phases done';

  // Sparkline domain: scale config bounds, or fit the data.
  const spark = bundle.sparkValues;
  let yMin = 1;
  let yMax = 5;
  if (bundle.sparkMetric?.type === 'scale') {
    const cfg = bundle.sparkMetric.config as ScaleConfig;
    yMin = cfg.min ?? 1;
    yMax = cfg.max ?? 5;
  } else if (spark.length > 0) {
    yMin = Math.min(...spark);
    yMax = Math.max(...spark);
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
  }
  const sparkWidth = Math.min(windowWidth, MaxContentWidth) - Spacing.three * 2 - 20 * 2;

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.card, { borderColor: colors.cardBorder }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${experiment.title}, ${chip}`}
        accessibilityHint="Opens the experiment"
        onPress={() => router.push(`/experiment/${experiment.id}` as never)}
        style={({ pressed }) => [styles.headerRow, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={{ flexShrink: 1, gap: 10 }}>
          <View
            style={[
              styles.phaseChip,
              { backgroundColor: colors.tintSoft, borderColor: 'rgba(224,87,74,0.3)' },
            ]}>
            <ThemedText type="label" style={{ color: colors.tint }}>
              {chip}
            </ThemedText>
          </View>
          <ThemedText type="headline">{experiment.title}</ThemedText>
        </View>
        <ThemedText style={{ color: colors.textFaint, fontSize: 22, lineHeight: 26 }}>›</ThemedText>
      </Pressable>

      {activePhase && (
        <>
          <DayDots
            phases={ordered}
            dayIndex={daysBefore + dayInPhase}
            loggedToday={allDone}
          />
          <View style={styles.phaseLabels}>
            {ordered.slice(0, 2).map((p) => (
              <ThemedText key={p.id} type="label">
                Phase {p.label}
              </ThemedText>
            ))}
          </View>
        </>
      )}

      {spark.length >= 2 && (
        <Sparkline
          values={spark}
          yMin={yMin}
          yMax={yMax}
          width={sparkWidth}
          height={72}
          color={colors.tintStrong}
          accessibilityLabel={`${bundle.sparkMetric?.name}: ${spark.length} observations, latest ${spark[spark.length - 1]}`}
        />
      )}

      {finished && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/verdict/${experiment.id}` as never)}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.cream, transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}>
          <ThemedText type="smallBold" style={[styles.ctaText, { color: colors.onCream }]}>
            Settle it →
          </ThemedText>
        </Pressable>
      )}

      {isToday && activePhase && !allDone && scheduled.length > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/checkin/${experiment.id}` as never)}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.cream, transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}>
          <ThemedText type="smallBold" style={[styles.ctaText, { color: colors.onCream }]}>
            Check in · {doneCount}/{scheduled.length} done
          </ThemedText>
        </Pressable>
      )}

      {isToday && activePhase && allDone && (
        <View
          style={[
            styles.cta,
            styles.checkedIn,
            { backgroundColor: colors.successSoft, borderColor: 'rgba(76,195,138,0.5)' },
          ]}
          accessible
          accessibilityLabel="Checked in for today">
          <ThemedText type="smallBold" style={[styles.ctaText, { color: colors.success }]}>
            ✓ Checked in for today
          </ThemedText>
        </View>
      )}

      {!isToday && !upcomingPhase && !finished && (
        <View style={styles.rows}>
          {metrics.map((m) => (
            <QuickLogRow
              key={m.id}
              metric={m}
              loggedToday={todayCounts[m.id] ?? 0}
              missedCount={missedCounts[m.id] ?? 0}
              onLog={(value) => onLog(m.id, value)}
              onMiss={(todayCounts[m.id] ?? 0) === 0 ? () => onMiss(m.id) : undefined}
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
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: Spacing.three,
    alignSelf: 'stretch',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  phaseChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  phaseLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -Spacing.two,
  },
  cta: {
    borderRadius: 999,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  ctaText: {
    fontSize: 17,
    lineHeight: 22,
  },
  checkedIn: {
    borderWidth: 1.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  rows: {
    marginTop: -Spacing.one,
  },
});
