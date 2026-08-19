// Insights: what your finished experiments actually taught you.
// Stats strip, then one card per experiment — stamp, headline finding,
// your written conclusion, adopted state. Clone to re-run; export everything.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VerdictStamp } from '@/components/verdict-stamp';
import { ArchetypeIdentity } from '@/constants/archetypes';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { cloneExperimentById, exportAllJson, getInsights } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';

export default function InsightsScreen() {
  const router = useRouter();
  const colors = useTheme();
  const queryClient = useQueryClient();

  const { data } = useQuery({ queryKey: ['insights'], queryFn: getInsights });
  const insights = data?.insights ?? [];
  const stats = data?.stats;

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
    const file = new File(Paths.cache, `redglass-export-${Date.now()}.json`);
    file.write(json);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <ThemedText type="title">Insights</ThemedText>
            <Pressable onPress={exportJson}>
              <ThemedText type="small" style={{ color: colors.tint }}>
                Export JSON
              </ThemedText>
            </Pressable>
          </View>

          {stats && insights.length > 0 && (
            <View style={styles.statsRow}>
              {[
                { n: stats.completed, label: 'settled' },
                { n: stats.adopted, label: 'adopted' },
                { n: stats.refuted, label: 'refuted' },
                { n: stats.observations, label: 'observations' },
              ].map((s) => (
                <ThemedView key={s.label} type="backgroundElement" style={styles.statCell}>
                  <ThemedText type="subtitle" style={{ color: colors.tint }}>
                    {s.n}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: colors.textSecondary }}>
                    {s.label}
                  </ThemedText>
                </ThemedView>
              ))}
            </View>
          )}

          {insights.length === 0 && (
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText style={styles.emptyEmoji}>📔</ThemedText>
              <ThemedText type="small" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                No settled experiments yet. Every verdict you seal becomes an insight here — your
                personal book of things you actually tested.
              </ThemedText>
            </ThemedView>
          )}

          {insights.map(({ experiment, verdict, headline }) => (
            <Pressable
              key={experiment.id}
              onPress={() => router.push(`/experiment/${experiment.id}` as never)}>
              <ThemedView type="backgroundElement" style={styles.entryCard}>
                <View style={styles.entryHeader}>
                  <ThemedText type="smallBold" style={{ flexShrink: 1 }}>
                    {ArchetypeIdentity[experiment.archetype].emoji} {experiment.title}
                  </ThemedText>
                  <VerdictStamp
                    outcome={experiment.status === 'abandoned' ? 'abandoned' : (verdict?.outcome ?? 'inconclusive')}
                  />
                </View>

                {headline && (
                  <ThemedText type="small" style={{ color: colors.tint }}>
                    {headline}
                  </ThemedText>
                )}

                {verdict && (
                  <ThemedText
                    type="small"
                    numberOfLines={3}
                    style={{ color: colors.textSecondary, fontStyle: 'italic' }}>
                    “{verdict.conclusion}”
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
                    {verdict?.willAdopt === true && ' · change adopted'}
                    {verdict?.willAdopt === false && ' · change dropped'}
                  </ThemedText>
                  <Pressable onPress={() => clone.mutate(experiment.id)}>
                    <ThemedText type="small" style={{ color: colors.tint }}>
                      Clone & re-run
                    </ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            </Pressable>
          ))}
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
    paddingTop: Platform.OS === 'web' ? 72 : Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 0,
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
    gap: Spacing.two,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  entryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.half,
  },
});
