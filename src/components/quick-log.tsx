// Quick-log chips (§7): scale = tappable dots, boolean = ✓/✗,
// numeric/currency/duration = navigates to the number-pad sheet.
// Optimize for < 5 seconds per log.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { Metric, ScaleConfig } from '@/domain/types';
import { tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  metric: Metric;
  loggedToday: number;
  missedCount?: number;
  onLog: (value: number) => void;
  onMiss?: () => void; // offered on past days with nothing logged
}

export function QuickLogRow({ metric, loggedToday, missedCount = 0, onLog, onMiss }: Props) {
  const router = useRouter();
  const colors = useTheme();
  const [justLogged, setJustLogged] = useState(false);

  const log = (value: number) => {
    tapFeedback();
    setJustLogged(true);
    onLog(value);
    setTimeout(() => setJustLogged(false), 1200);
  };

  const done =
    'timesPerDay' in metric.schedule ? loggedToday >= metric.schedule.timesPerDay : false;
  const allMissed = done && missedCount > 0 && missedCount >= loggedToday;

  if (done) {
    return (
      <View style={styles.row}>
        <View style={styles.labelCol}>
          <ThemedText type="smallBold" style={{ color: colors.textSecondary }}>
            {metric.name}
          </ThemedText>
        </View>
        <View
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

  return (
    <View style={styles.row}>
      <View style={styles.labelCol}>
        <ThemedText type="smallBold">{metric.name}</ThemedText>
        <ThemedText type="small" style={{ color: colors.textSecondary }}>
          {justLogged ? 'Logged ✓' : `${loggedToday} logged`}
        </ThemedText>
        {onMiss && (
          <Pressable onPress={onMiss} hitSlop={8}>
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
              onPress={() => log(v)}
              style={({ pressed }) => [
                styles.dot,
                scaleValues(metric).length > 6 && styles.dotCompact,
                {
                  backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
                },
              ]}>
              <ThemedText type="smallBold">{v}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      {metric.type === 'boolean' && (
        <View style={styles.chips}>
          <Pressable
            onPress={() => log(1)}
            style={({ pressed }) => [
              styles.dot,
              { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
            ]}>
            <ThemedText type="smallBold">✓</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => log(0)}
            style={({ pressed }) => [
              styles.dot,
              { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
            ]}>
            <ThemedText type="smallBold">✗</ThemedText>
          </Pressable>
        </View>
      )}

      {(metric.type === 'numeric' || metric.type === 'currency' || metric.type === 'duration') && (
        <Pressable
          onPress={() => router.push(`/log/${metric.id}` as never)}
          style={({ pressed }) => [
            styles.enterButton,
            { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
          ]}>
          <ThemedText type="smallBold">Enter…</ThemedText>
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
    maxWidth: 200, // five compact dots per row for 1-10 scales
  },
  dotCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  doneCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
