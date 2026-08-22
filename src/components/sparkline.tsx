// Self-drawing sparkline (redesign): area fill fades up, the line reveals
// left-to-right, and the latest point pops in at the end. The reveal animates
// a clipping view's width — compositor-friendly, no animated SVG props.

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

const PAD = 10;

export function Sparkline({
  values,
  yMin,
  yMax,
  width,
  height,
  color,
  accessibilityLabel,
}: {
  values: number[];
  yMin: number;
  yMax: number;
  width: number;
  height: number;
  color: string;
  accessibilityLabel?: string;
}) {
  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.value = 0;
    reveal.value = withDelay(
      250,
      withTiming(1, {
        duration: 1000,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      })
    );
  }, [reveal, values.length]);

  const clip = useAnimatedStyle(() => ({ width: width * reveal.value }));

  if (values.length === 0 || width <= 0) return <View style={{ height }} />;

  const span = Math.max(0.0001, yMax - yMin);
  const pt = (v: number, i: number): [number, number] => [
    PAD + (i / Math.max(1, values.length - 1)) * (width - 2 * PAD),
    height - PAD - ((v - yMin) / span) * (height - 2 * PAD),
  ];
  const pts = values.map(pt);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${height - 4} L${pts[0][0].toFixed(1)} ${height - 4} Z`;
  const [endX, endY] = pts[pts.length - 1];
  const gradId = `spark-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View style={{ width, height }} accessible accessibilityLabel={accessibilityLabel}>
      <Animated.View style={[styles.clip, { height }, clip]}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.3} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${gradId})`} />
          <Path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
      <Animated.View
        entering={ZoomIn.delay(1150).springify().damping(14).stiffness(220)}
        style={[
          styles.endDot,
          { left: endX - 5, top: endY - 5, backgroundColor: color, shadowColor: color },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    position: 'absolute',
    left: 0,
    top: 0,
  },
  endDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
