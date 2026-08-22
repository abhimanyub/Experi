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
import { showError } from '@/lib/confirm';
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
    try {
      const json = await exportAllJson();
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(json);
        Alert.alert('Copied', 'Export JSON copied to clipboard (web).');
        return;
      }
      const file = new File(Paths.cache, `redglass-export-${Date.now()}.json`);
      file.write(json);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
    } catch (e) {
      showError('Export failed', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <View style={styles.brandLeft}>
              <View style={styles.orb}>
                <View style={styles.orbHighlight} />
              </View>
              <ThemedText type="headline" style={{ fontSize: 17, lineHeight: 22 }}>
                Red Glass
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              hitSlop={12}
              onPress={exportJson}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <ThemedText type="smallBold" style={{ color: colors.tint }}>
                Export JSON
              </ThemedText>
            </Pressable>
          </View>
          <ThemedText type="title">Insights</ThemedText>

          {stats && insights.length > 0 && (
            <View style={styles.statsRow}>
              {[
                { n: stats.completed, label: 'settled', color: colors.tint },
                { n: stats.adopted, label: 'adopted', color: colors.success },
                { n: stats.refuted, label: 'refuted', color: colors.warning },
                { n: stats.observations, label: 'observations', color: colors.text },
              ].map((s) => (
                <ThemedView
                  key={s.label}
                  type="backgroundElement"
                  style={[styles.statCell, { borderColor: colors.cardBorder }]}
                  accessible
                  accessibilityLabel={`${s.n} ${s.label}`}>
                  <ThemedText type="headline" style={{ fontSize: 26, lineHeight: 31, color: s.color }}>
                    {s.n}
                  </ThemedText>
                  <ThemedText type="small" style={{ fontSize: 11.5, color: colors.textSecondary, fontWeight: 600 }}>
                    {s.label}
                  </ThemedText>
                </ThemedView>
              ))}
            </View>
          )}

          {insights.length === 0 && (
            <ThemedView
              type="backgroundElement"
              style={[styles.empty, { borderColor: colors.cardBorder }]}>
              <ThemedText style={styles.emptyEmoji}>📔</ThemedText>
              <ThemedText type="small" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                No settled experiments yet. Every verdict you seal becomes an insight here — your
                personal book of things you actually tested.
              </ThemedText>
            </ThemedView>
          )}

          {insights.map(({ experiment, verdict, headline }) => (
            /* The card body navigates; the footer's Clone action stays a
               sibling, not a nested pressable — VoiceOver focus stays sane. */
            <ThemedView
              key={experiment.id}
              type="backgroundElement"
              style={[styles.entryCard, { borderColor: colors.cardBorder }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${experiment.title}. Opens the experiment.`}
                onPress={() => router.push(`/experiment/${experiment.id}` as never)}
                style={({ pressed }) => [styles.entryBody, { opacity: pressed ? 0.7 : 1 }]}>
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
              </Pressable>

              <View style={styles.entryFooter}>
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  {experiment.endedAt ? new Date(experiment.endedAt).toLocaleDateString() : ''}
                  {verdict?.willAdopt === true && ' · change adopted'}
                  {verdict?.willAdopt === false && ' · change dropped'}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Clone and re-run ${experiment.title}`}
                  hitSlop={12}
                  onPress={() => clone.mutate(experiment.id)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <ThemedText type="smallBold" style={{ color: colors.tint }}>
                    Clone & re-run →
                  </ThemedText>
                </Pressable>
              </View>
            </ThemedView>
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
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  orb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#C74A3D',
    shadowColor: '#E0574A',
    shadowOpacity: 0.5,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    overflow: 'hidden',
  },
  orbHighlight: {
    position: 'absolute',
    left: 4,
    top: 3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#E88A74',
    opacity: 0.9,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    gap: 0,
  },
  empty: {
    borderRadius: Spacing.four,
    borderWidth: 1,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyEmoji: {
    fontSize: 48,
    lineHeight: 60,
  },
  entryCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    gap: Spacing.two,
  },
  entryBody: {
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
