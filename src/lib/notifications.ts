// Local notification scheduling per metric schedule (§7).
// Tapping a notification deep-links to the quick-log sheet for that metric.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Metric } from '../domain/types';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Ask for notification permission. Call this at the moment reminders become
 * real to the user (choosing "Daily reminders", starting an experiment with
 * reminder times) — never at cold launch with zero context.
 */
export async function ensureNotificationSetup(): Promise<boolean> {
  if (Platform.OS === 'web') return false; // local scheduling is native-only in v1
  if (Platform.OS === 'android') {
    // Channel must exist before the Android 13+ permission prompt.
    await Notifications.setNotificationChannelAsync('observations', {
      name: 'Observation reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Current permission state without prompting. */
export async function notificationsAllowed(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

function parseHHmm(s: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Schedule daily reminders for a metric. Returns scheduled notification ids. */
export async function scheduleMetricReminders(
  metric: Metric,
  experimentTitle: string
): Promise<string[]> {
  if (!('remindAt' in metric.schedule)) return [];
  const ids: string[] = [];
  for (const time of metric.schedule.remindAt) {
    const parsed = parseHHmm(time);
    if (!parsed) continue;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: experimentTitle,
        body: `Log: ${metric.name}`,
        data: { url: `/log/${metric.id}` },
        ...(Platform.OS === 'android' ? { channelId: 'observations' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: parsed.hour,
        minute: parsed.minute,
      },
    });
    ids.push(id);
  }
  return ids;
}

/** Cancel everything and reschedule from the current set of active metrics.
 * No-op when permission was denied — scheduling doomed notifications would
 * only make the ⏰ UI lie about reminders arriving. */
export async function rescheduleAll(
  items: { metric: Metric; experimentTitle: string }[]
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!(await notificationsAllowed())) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const { metric, experimentTitle } of items) {
    await scheduleMetricReminders(metric, experimentTitle);
  }
}
