import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDbReady } from '@/db/use-db-ready';
import { showError } from '@/lib/confirm';
import { errorFeedback } from '@/lib/haptics';

SplashScreen.preventAutoHideAsync();

// Every mutation failure surfaces here unless a mutation handles it closer to
// the action — a write must never fail silently (spec: no confetti over lost data).
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      errorFeedback();
      showError(
        'That didn’t save',
        error instanceof Error ? error.message : 'Something went wrong — please try again.'
      );
    },
  }),
});

function useNotificationDeepLink() {
  const router = useRouter();
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    });
    return () => sub.remove();
  }, [router]);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { success, error } = useDbReady();
  useNotificationDeepLink();

  useEffect(() => {
    if (success || error) SplashScreen.hideAsync();
  }, [success, error]);

  if (error) {
    return (
      <ThemedView style={styles.errorScreen}>
        <ThemedText type="headline">Something broke on startup</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.errorDetail}>
          {error.message}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.errorDetail}>
          Your data is untouched. Force-quit and reopen the app; if this keeps happening,
          reinstalling clears the local database.
        </ThemedText>
      </ThemedView>
    );
  }
  if (!success) return null; // splash still covering

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="new" options={{ presentation: 'modal', title: 'New experiment' }} />
          <Stack.Screen
            name="log/[metricId]"
            options={{ presentation: 'formSheet', sheetAllowedDetents: [0.5], title: 'Log' }}
          />
          <Stack.Screen name="experiment/[id]" options={{ title: 'Experiment' }} />
          <Stack.Screen
            name="checkin/[experimentId]"
            options={{ presentation: 'formSheet', sheetAllowedDetents: [0.75], title: 'Check in' }}
          />
          <Stack.Screen
            name="ai-draft"
            options={{ presentation: 'modal', title: 'Draft with Claude' }}
          />
          <Stack.Screen
            name="verdict/[experimentId]"
            options={{ presentation: 'fullScreenModal', title: 'Verdict' }}
          />
          <Stack.Screen
            name="confounder/[experimentId]"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.6],
              title: 'Something happened',
            }}
          />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  errorDetail: {
    textAlign: 'center',
  },
});
