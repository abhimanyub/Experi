// Hands a parsed AI draft from the ai-draft screen to the wizard.

import { create } from 'zustand';
import { ParsedDraft } from './ai-draft';

interface AiDraftStore {
  draft: ParsedDraft | null;
  setDraft: (draft: ParsedDraft) => void;
  clear: () => void;
}

export const useAiDraftStore = create<AiDraftStore>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clear: () => set({ draft: null }),
}));
