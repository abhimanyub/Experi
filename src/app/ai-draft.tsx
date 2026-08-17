// Draft with Claude: describe the idea → copy structured prompt → paste the
// JSON reply → parsed draft prefills the wizard. On-device intelligence can
// slot in here later behind the same ParsedDraft contract.

import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { buildPrompt, parseDraft } from '@/lib/ai-draft';
import { useAiDraftStore } from '@/lib/ai-draft-store';
import { successFeedback, tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

export default function AiDraftScreen() {
  const router = useRouter();
  const colors = useTheme();
  const setDraft = useAiDraftStore((s) => s.setDraft);

  const [idea, setIdea] = useState('');
  const [pasted, setPasted] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyPrompt = async () => {
    tapFeedback();
    await Clipboard.setStringAsync(buildPrompt(idea));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pasteFromClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setPasted(text);
  };

  const createDraft = () => {
    try {
      const draft = parseDraft(pasted);
      setError(null);
      successFeedback();
      setDraft(draft);
      // The wizard is the screen below this modal; its store subscription has
      // already prefilled and jumped to Review — just return to it.
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="smallBold">1 · Describe your idea</ThemedText>
        <ThemedView type="backgroundElement" style={styles.inputBox}>
          <TextInput
            value={idea}
            onChangeText={setIdea}
            placeholder="e.g. Does cutting coffee after 2pm improve my sleep?"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text }]}
            multiline
          />
        </ThemedView>

        <Pressable
          disabled={!idea.trim()}
          onPress={copyPrompt}
          style={[
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: idea.trim() ? 1 : 0.4 },
          ]}>
          <ThemedText type="smallBold" style={{ color: colors.onTint }}>
            {copied ? 'Copied ✓' : 'Copy prompt for Claude'}
          </ThemedText>
        </Pressable>
        <ThemedText type="small" style={{ color: colors.textSecondary }}>
          Paste it into Claude (app or claude.ai), then copy the JSON reply back here.
        </ThemedText>

        <ThemedText type="smallBold" style={styles.stepLabel}>
          2 · Paste Claude's reply
        </ThemedText>
        <ThemedView type="backgroundElement" style={styles.inputBox}>
          <TextInput
            value={pasted}
            onChangeText={(t) => {
              setPasted(t);
              setError(null);
            }}
            placeholder='{"title": …}'
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, styles.pasteInput, { color: colors.text }]}
            multiline
          />
        </ThemedView>
        <Pressable onPress={pasteFromClipboard} style={styles.linkButton}>
          <ThemedText type="small" style={{ color: colors.tint }}>
            Paste from clipboard
          </ThemedText>
        </Pressable>

        {error && (
          <ThemedText type="small" style={{ color: colors.textSecondary }}>
            ⚠︎ {error}
          </ThemedText>
        )}

        <Pressable
          disabled={!pasted.trim()}
          onPress={createDraft}
          style={[
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pasted.trim() ? 1 : 0.4 },
          ]}>
          <ThemedText type="smallBold" style={{ color: colors.onTint }}>
            Review in wizard
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  stepLabel: {
    marginTop: Spacing.three,
  },
  inputBox: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  input: {
    minHeight: 60,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  pasteInput: {
    minHeight: 120,
    fontFamily: 'ui-monospace',
    fontSize: 13,
  },
  primaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.one,
  },
  linkButton: {
    paddingVertical: Spacing.one,
  },
});
