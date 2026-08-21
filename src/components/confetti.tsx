// Confetti burst for celebrations, in the phase-palette colors.
// Pure reanimated — no deps, index-seeded pseudorandom (Date/Math.random-free
// per piece so renders stay stable).

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { PhasePalette } from '@/constants/viz';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PIECES = 26;

function seeded(i: number, salt: number): number {
  // deterministic 0..1 per piece
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function Piece({ index, scheme }: { index: number; scheme: 'light' | 'dark' }) {
  const progress = useSharedValue(0);
  const palette = PhasePalette[scheme];
  const color = palette[index % palette.length];

  const startX = seeded(index, 1) * 300 - 150; // spread around center
  const drift = seeded(index, 2) * 120 - 60;
  const fall = 260 + seeded(index, 3) * 180;
  const size = 6 + seeded(index, 4) * 6;
  const delay = seeded(index, 5) * 250;
  const spin = (seeded(index, 6) - 0.5) * 720;

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) })
    );
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: startX + drift * progress.value },
      { translateY: -40 + fall * progress.value },
      { rotate: `${spin * progress.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        style,
        {
          backgroundColor: color,
          width: size,
          height: size * 0.6,
          borderRadius: 2,
        },
      ]}
    />
  );
}

export function ConfettiBurst() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const reducedMotion = useReducedMotion();
  // Celebrations degrade to nothing under reduced motion — the check icon
  // and copy still carry the moment.
  if (reducedMotion) return null;
  return (
    <View pointerEvents="none" style={styles.container}>
      {Array.from({ length: PIECES }, (_, i) => (
        <Piece key={i} index={i} scheme={scheme} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 120,
    overflow: 'hidden',
  },
  piece: {
    position: 'absolute',
  },
});
