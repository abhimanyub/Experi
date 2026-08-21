// Fizz: the glass is the interface. An outlined tall glass that fills with
// red as today's check-ins complete. fraction 0..1; springs on change.
// The liquid animates scaleY (compositor-friendly) from a bottom origin,
// critically damped — no gesture momentum, so no overshoot.

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

const W = 26;
const H = 40;
const WALL = 2.5;
const INNER_H = H - WALL * 2 - 2;

export function GlassFill({
  fraction,
  accessibilityLabel,
}: {
  fraction: number;
  accessibilityLabel?: string;
}) {
  const colors = useTheme();
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withSpring(Math.max(0, Math.min(1, fraction)), {
      damping: 22,
      stiffness: 120,
      reduceMotion: ReduceMotion.System,
    });
  }, [fraction, fill]);

  const liquidStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: fill.value }],
  }));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.glass,
        { borderColor: colors.text, backgroundColor: colors.background },
      ]}>
      <Animated.View
        style={[styles.liquid, { backgroundColor: colors.tint }, liquidStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    width: W,
    height: H,
    borderWidth: WALL,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 1,
  },
  liquid: {
    height: INNER_H,
    borderRadius: 3,
    transformOrigin: 'bottom',
  },
});
