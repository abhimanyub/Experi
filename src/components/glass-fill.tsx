// Fizz: the glass is the interface. An outlined tall glass that fills with
// red as today's check-ins complete. fraction 0..1; springs on change.

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

const W = 26;
const H = 40;
const WALL = 2.5;

export function GlassFill({ fraction }: { fraction: number }) {
  const colors = useTheme();
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withSpring(Math.max(0, Math.min(1, fraction)), {
      damping: 14,
      stiffness: 120,
    });
  }, [fraction, fill]);

  const liquidStyle = useAnimatedStyle(() => ({
    height: (H - WALL * 2 - 2) * fill.value,
  }));

  return (
    <View
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
    borderRadius: 3,
  },
});
