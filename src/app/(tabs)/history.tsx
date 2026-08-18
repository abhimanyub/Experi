// History (M5): completed/abandoned experiments with outcome badges,
// clone-to-rerun, and JSON export.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { cloneExperimentById, exportAllJson, getHistory } from '@/db/repo';
import { VerdictOutcome } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';

const OUTCOME_BADGES: Record<VerdictOutcome, { label: string; emoji: string }> = {
  supported: { label: 'Supported', emoji: '✅' },
  refuted: { label: 'Refuted', emoji: '❌' },
  inconclusive: { label: 'Inconclusive', emoji: '🤷' },
  contaminated: { label: 'Contaminated', emoji: '⚠️' },
};

export default function HistoryScreen() {
  const router = useRouter();
  const colors = useTheme();
  const queryClient = useQueryClient();

  const { data: entries = [] } = useQuery({ queryKey: ['history'], queryFn: getHistory });

  const clone = useMutation({
    mutationFn: (id: string) => cloneExperimentById(id, Date.now()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-experiments'] });
      Alert.alert('Cloned', 'A fresh draft is waiting on the Today tab.');
    },
  });

  const exportJson = async () => {
    const json = await exportAllJson();
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(json);
      Alert.alert('Copied', 'Export JSON copied to clipboard (web).');
      return;
    }
    const file = new File(Paths.cache, `experi-export-${Date.now()}.json`);
    file.write(json);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <ThemedText type="title">History</ThemedText>
            <Pressable onPress={exportJson}>
              <ThemedText type="small" style={{ color: colors.tint }}>
                Export JSON
              </ThemedText>
            </Pressable>
          </View>

          {entries.length === 0 && (
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText style={styles.emptyEmoji}>📔</ThemedText>
              <ThemedText type="small" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                No finished experiments yet. Every one you complete lands here with its verdict —
                your personal book of settled debates.
              </ThemedText>
            </ThemedView>
          )}

          {entries.map(({ experiment, verdict }) => {
            const badge =
              experiment.status === 'abandoned'
                ? { label: 'Abandoned', emoji: '🏳️' }
                : verdict
                  ? OUTCOME_BADGES[verdict.outcome]
                  : { label: 'Completed', emoji: '✓' };
            return (
              <Pressable
                key={experiment.id}
                onPress={() => router.push(`/experiment/${experiment.id}` as never)}>
                <ThemedView type="backgroundElement" style={styles.entryCard}>
                  <View style={styles.entryHeader}>
                    <ThemedText type="smallBold" style={{ flexShrink: 1 }}>
                      {experiment.title}
                    </ThemedText>
                    <View style={[styles.badge, { backgroundColor: colors.backgroundSelected }]}>
                      <ThemedText type="small">
                        {badge.emoji} {badge.label}
                      </ThemedText>
                    </View>
                  </View>
                  {verdict && (
                    <ThemedText
                      type="small"
                      numberOfLines={2}
                      style={{ color: colors.textSecondary }}>
                      {verdict.conclusion}
                    </ThemedText>
                  )}
                  {experiment.status === 'abandoned' && experiment.abandonReason && (
                    <ThemedText type="small" style={{ color: colors.textSecondary }}>
                      Reason: {experiment.abandonReason}
                    </ThemedText>
                  )}
                  <View style={styles.entryFooter}>
                    <ThemedText type="small" style={{ color: colors.textSecondary }}>
                      {experiment.endedAt ? new Date(experiment.endedAt).toLocaleDateString() : ''}
                      {verdict?.willAdopt === true && ' · adopted'}
                      {verdict?.willAdopt === false && ' · dropped'}
                    </ThemedText>
                    <Pressable onPress={() => clone.mutate(experiment.id)}>
                      <ThemedText type="small" style={{ color: colors.tint }}>
                        Clone & re-run
                      </ThemedText>
                    </Pressable>
                  </View>
                </ThemedView>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  safeArea: { flex: 1, paddingHorizontal: Spacing.three, maxWidth: MaxContentWidth },
  content: {
    gap: Spacing.two,
    paddingTop: Platform.OS === 'web' ? 72 : Spacing.three, // clear the floating web tab bar
    paddingBottom: BottomTabInset + Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyEmoji: {
    fontSize: 48,
    lineHeight: 60,
  },
  entryCard: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  entryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
});
