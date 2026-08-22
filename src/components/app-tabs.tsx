// Floating tab bar (redesign): a translucent pill with Today / Insights plus
// a cream "+" FAB that opens the new-experiment sheet. One implementation for
// every platform — replaces the native tab bar.

import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

const colors = Colors.dark;

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ selected: !!isFocused }}
      style={({ pressed }) => [
        styles.tabButton,
        isFocused && { backgroundColor: 'rgba(255,255,255,0.12)' },
        pressed && { transform: [{ scale: 0.95 }] },
      ]}>
      <ThemedText
        type="smallBold"
        style={{ fontSize: 15, color: isFocused ? colors.text : colors.textSecondary }}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

function Fab() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const halo = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    halo.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 1200, reduceMotion: ReduceMotion.System })
      ),
      -1
    );
  }, [halo, reduced]);
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - halo.value),
    transform: [{ scale: 1 + 0.35 * halo.value }],
  }));

  return (
    <View>
      <Animated.View pointerEvents="none" style={[styles.fabHalo, haloStyle]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New experiment"
        onPress={() => router.push('/new' as never)}
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.9 }] }]}>
        <ThemedText style={{ fontSize: 26, fontWeight: 700, color: colors.onCream, lineHeight: 30 }}>
          +
        </ThemedText>
      </Pressable>
    </View>
  );
}

/** Dock chrome: triggers arrive as children (the navigator must see them as
 * direct TabList children to register the screens). */
function Dock({ children, ...props }: TabListProps) {
  return (
    <View {...props} style={styles.dock}>
      <View style={styles.pill}>{children}</View>
      <Fab />
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <Dock>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Today</TabButton>
          </TabTrigger>
          <TabTrigger name="history" href="/history" asChild>
            <TabButton>Insights</TabButton>
          </TabTrigger>
        </Dock>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.select({ ios: 42, default: 28 }),
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  pill: {
    flexDirection: 'row',
    gap: Spacing.one,
    padding: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(29,27,24,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(16px) saturate(160%)', backgroundColor: 'rgba(29,27,24,0.75)' } as object)
      : null),
  },
  tabButton: {
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
  },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  fabHalo: {
    position: 'absolute',
    inset: 0,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: '#E0574A',
  },
});
