// Daily-dots mini chart (spec §6): x = time, y = value, dot color = phase slot.
// Flagged (confounded) observations render dimmed with a hollow center.
// Identity comes from the phase timeline legend rendered above the charts.

import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { phaseColor } from '@/constants/viz';
import { Metric, Observation, Phase, ScaleConfig } from '@/domain/types';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const HEIGHT = 96;
const DOT_R = 4; // 8px marker
const PAD = { top: 8, bottom: 8, left: 30, right: 8 };

export function DotChart({
  metric,
  phases,
  observations,
  width,
}: {
  metric: Metric;
  phases: Phase[];
  observations: Observation[];
  width: number;
}) {
  const colors = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence);
  const phaseIndex = new Map(ordered.map((p, i) => [p.id, i]));
  const obs = observations
    .filter((o) => o.metricId === metric.id)
    .sort((a, b) => a.observedAt - b.observedAt);

  if (obs.length === 0) {
    return (
      <View style={[styles.empty, { height: HEIGHT }]}>
        <ThemedText type="small" style={{ color: colors.textSecondary }}>
          No observations yet
        </ThemedText>
      </View>
    );
  }

  // Y domain: scale metrics use their configured range; others fit the data.
  let yMin: number, yMax: number;
  if (metric.type === 'scale') {
    const cfg = metric.config as ScaleConfig;
    yMin = cfg.min ?? 1;
    yMax = cfg.max ?? 5;
  } else if (metric.type === 'boolean') {
    yMin = 0;
    yMax = 1;
  } else {
    const values = obs.map((o) => o.value);
    yMin = Math.min(...values);
    yMax = Math.max(...values);
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
  }

  const tMin = obs[0].observedAt;
  const tMax = obs[obs.length - 1].observedAt;
  const tSpan = Math.max(1, tMax - tMin);
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const x = (t: number) => PAD.left + ((t - tMin) / tSpan) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  return (
    <View>
      <Svg width={width} height={HEIGHT}>
        {/* recessive grid: min/max only */}
        {[yMin, yMax].map((v) => (
          <Line
            key={v}
            x1={PAD.left}
            x2={width - PAD.right}
            y1={y(v)}
            y2={y(v)}
            stroke={colors.backgroundSelected}
            strokeWidth={1}
          />
        ))}
        {obs.map((o) => {
          const color = phaseColor(scheme, phaseIndex.get(o.phaseId) ?? 0);
          return o.flagged ? (
            <Circle
              key={o.id}
              cx={x(o.observedAt)}
              cy={y(o.value)}
              r={DOT_R - 1}
              stroke={color}
              strokeWidth={1.5}
              fill="none"
              opacity={0.45}
            />
          ) : (
            <Circle key={o.id} cx={x(o.observedAt)} cy={y(o.value)} r={DOT_R} fill={color} />
          );
        })}
      </Svg>
      {/* axis extremes in text tokens, not series color */}
      <View style={[styles.yLabels, { height: HEIGHT }]} pointerEvents="none">
        <ThemedText type="small" style={{ color: colors.textSecondary, fontSize: 10 }}>
          {yMax}
        </ThemedText>
        <ThemedText type="small" style={{ color: colors.textSecondary, fontSize: 10 }}>
          {yMin}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  yLabels: {
    position: 'absolute',
    left: 0,
    top: 0,
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
});
