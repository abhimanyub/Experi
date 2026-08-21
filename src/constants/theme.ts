/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Red Glass palette: warm paper in light mode, warm ink in dark
// (mode follows the system setting via useColorScheme). Brand red is the
// interactive tint; success/warning are tuned per mode for WCAG AA text
// contrast (bright chart-family hues live in constants/viz.ts instead).
// onTint flips to near-ink in dark mode: dark text on a bright fill keeps
// button labels legible where white would drop below 3.5:1.
export const Colors = {
  light: {
    text: '#1E1818',
    background: '#FBF7F5',
    backgroundElement: '#F4EDEA',
    backgroundSelected: '#EADFDA',
    textSecondary: '#6F6360',
    tint: '#C8353B',
    tintSoft: '#FBE5E4',
    onTint: '#ffffff',
    success: '#0B7A52',
    successSoft: '#E0F5EC',
    warning: '#8A5F00',
    warningSoft: '#FBF0DA',
  },
  dark: {
    text: '#F5EFED',
    background: '#171212',
    backgroundElement: '#252020',
    backgroundSelected: '#332B2B',
    textSecondary: '#AB9E9A',
    tint: '#E85C63',
    tintSoft: '#3A1D1F',
    onTint: '#171212',
    success: '#35C08E',
    successSoft: '#123227',
    warning: '#E3A93E',
    warningSoft: '#332A16',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
