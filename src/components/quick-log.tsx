// Quick-log chips (§7): scale = tappable dots, boolean = ✓/✗,
// numeric/currency/duration = navigates to the number-pad sheet.
// Optimize for < 5 seconds per log — and forgive the mis-tap with Undo.

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { Metric, ScaleConfig } from '@/domain/types';
import { tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

const UNDO_WINDOW_MS = 5000;

interface Props {
  metric: Metric;
  loggedToday: number;
  missedCount?: number;
  onLog: (value: number) => void;
  onMiss?: () => void; // offered on past days with nothing logged
  onUndo?: () => void; // offered briefly after an instant log
}

export function QuickLogRow({
  metric,
  loggedToday,
  missedCount = 0,
  onLog,
  onMiss,
  onUndo,
}: Props) {
  const router = useRouter();
  const colors = useTheme();
  const [justLogged, setJustLogged] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const log = (value: number) => {
    tapFeedback();
    setJustLogged(true);
    onLog(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setJustLogged(false), UNDO_WINDOW_MS);
  };

  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    setJustLogged(false);
    onUndo?.();
  };

  const done =
    'timesPerDay' in metric.schedule ? loggedToday >= metric.schedule.timesPerDay : false;
  const allMissed = done && missedCount > 0 && missedCount >= loggedToday;

  if (done && !justLogged) {
    return (
      <View style={styles.row}>
        <View style={styles.labelCol}>
          <ThemedText type="smallBold" style={{ color: colors.textSecondary }}>
            {metric.name}
          </ThemedText>
        </View>
        <View
          accessibilityLabel={
            allMissed ? `${metric.name}: marked missed` : `${metric.name}: logged`
          }
          style={[
            styles.doneCheck,
            { backgroundColor: allMissed ? colors.backgroundSelected : colors.successSoft },
          ]}>
          <ThemedText
            type="smallBold"
            style={{ color: allMissed ? colors.textSecondary : colors.success }}>
            {allMissed ? '–' : '✓'}
          </ThemedText>
        </View>
      </View>
    );
  }

  if (done && justLogged) {
    // Fresh instant log: confirm and offer the take-back before settling.
    return (
      <View style={styles.row}>
        <View style={styles.labelCol}>
          <ThemedText type="smallBold" style={{ color: colors.textSecondary }}>
            {metric.name}
          </ThemedText>
          <ThemedText type="small" style={{ color: colors.success }}>
            Logged ✓
          </ThemedText>
        </View>
        {onUndo && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Undo ${metric.name} log`}
            hitSlop={8}
            onPress={undo}
            style={({ pressed }) => [
              styles.undoButton,
              { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
            ]}>
            <ThemedText type="smallBold">Undo</ThemedText>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.labelCol}>
        <ThemedText type="smallBold">{metric.name}</ThemedText>
        <ThemedText type="small" style={{ color: colors.textSecondary }}>
          {justLogged ? 'Logged ✓' : `${loggedToday} logged`}
        </ThemedText>
        {onMiss && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark ${metric.name} missed`}
            onPress={onMiss}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <ThemedText type="small" style={{ color: colors.warning }}>
              Mark missed
            </ThemedText>
          </Pressable>
        )}
      </View>

      {metric.type === 'scale' && (
        <View style={[styles.chips, scaleValues(metric).length > 6 && styles.chipsWide]}>
          {scaleValues(metric).map((v) => (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={`${metric.name}: ${v}`}
              hitSlop={scaleValues(metric).length > 6 ? 4 : 0}
              onPress={() => log(v)}
              style={({ pressed }) => [
                styles.dot,
                scaleValues(metric).length > 6 && styles.dotCompact,
                {
                  backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
                },
              ]}>
              <ThemedText type="smallBold" maxFontSizeMultiplier={1.4}>
                {v}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      {metric.type === 'boolean' && (
        <View style={styles.chips}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${metric.name}: yes`}
            onPress={() => log(1)}
            style={({ pressed }) => [
              styles.dot,
              { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
            ]}>
            <ThemedText type="smallBold" maxFontSizeMultiplier={1.4}>
              ✓
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${metric.name}: no`}
            onPress={() => log(0)}
            style={({ pressed }) => [
              styles.dot,
              { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
            ]}>
            <ThemedText type="smallBold" maxFontSizeMultiplier={1.4}>
              ✗
            </ThemedText>
          </Pressable>
        </View>
      )}

      {(metric.type === 'numeric' || metric.type === 'currency' || metric.type === 'duration') && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Log ${metric.name}`}
          onPress={() => router.push(`/log/${metric.id}` as never)}
          style={({ pressed }) => [
            styles.enterButton,
            { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
          ]}>
          <ThemedText type="smallBold">Log…</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function scaleValues(metric: Metric): number[] {
  const cfg = metric.config as ScaleConfig;
  const min = cfg.min ?? 1;
  const max = cfg.max ?? 5;
  const out: number[] = [];
  for (let v = min; v <= max; v++) out.push(v);
  return out;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  labelCol: {
    flexShrink: 1,
    gap: Spacing.half,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.one,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flexShrink: 1,
  },
  chipsWide: {
    maxWidth: 220, // five compact dots per row for 1-10 scales
  },
  dotCompact: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: 18,
  },
  dot: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    minHeight: 44,
    justifyContent: 'center',
  },
  undoButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    minHeight: 44,
    justifyContent: 'center',
  },
  doneCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
