// Haptic feedback wrappers — no-op on web.

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function tapFeedback() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function successFeedback() {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Heavy thud — the rubber stamp landing. */
export function stampFeedback() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

/** Something went wrong — pairs with an on-screen error, never fires alone. */
export function errorFeedback() {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
