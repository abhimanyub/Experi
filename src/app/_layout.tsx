import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Text, useColorScheme, View } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { db } from '@/db/client';
import migrations from '@/db/migrations/migrations';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

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
  const { success, error } = useMigrations(db, migrations);
  useNotificationDeepLink();

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>Migration failed: {error.message}</Text>
      </View>
    );
  }
  if (!success) return null; // splash still covering

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="new" options={{ presentation: 'modal', title: 'New experiment' }} />
          <Stack.Screen
            name="log/[metricId]"
            options={{ presentation: 'modal', title: 'Log observation' }}
          />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
