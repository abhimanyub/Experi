/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Lab-notebook palette: warm paper in light mode, warm ink in dark.
// Interactive tint + success stay from the validated viz palette family.
export const Colors = {
  light: {
    text: '#1C1B18',
    background: '#FBFAF7',
    backgroundElement: '#F2F0EA',
    backgroundSelected: '#E7E4DB',
    textSecondary: '#6B675C',
    tint: '#2a78d6',
    tintSoft: '#E3EEFB',
    onTint: '#ffffff',
    success: '#1baf7a',
    successSoft: '#E0F5EC',
    warning: '#c98500',
    warningSoft: '#FBF0DA',
  },
  dark: {
    text: '#F4F2ED',
    background: '#121110',
    backgroundElement: '#211F1C',
    backgroundSelected: '#2E2B27',
    textSecondary: '#A8A396',
    tint: '#3987e5',
    tintSoft: '#16283E',
    onTint: '#ffffff',
    success: '#199e70',
    successSoft: '#123227',
    warning: '#c98500',
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
