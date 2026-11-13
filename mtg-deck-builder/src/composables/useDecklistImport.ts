import { ref } from 'vue';
import type { Ref } from 'vue';
import type { Deck } from '../types/mtg';
import { resolveDecklist } from '../services/Scryfall';
import type { DecklistResolution } from '../services/Scryfall';

interface DecklistImportOptions {
  activeDeck: Ref<Deck | null>;
  replaceEntries: (
    entries: DecklistResolution['entries'],
    commanderNames: string[],
    companionName: string | null
  ) => void;
  showNotification: (message: string) => void;
}

export function useDecklistImport({
  activeDeck,
  replaceEntries,
  showNotification
}: DecklistImportOptions) {
  const showImportDialog = ref(false);
  const importText = ref('');
  const isImporting = ref(false);
  const importError = ref('');
  const importPreview = ref<DecklistResolution | null>(null);

  const resolveImport = async () => {
    if (!importText.value.trim()) {
      importError.value = 'Paste a decklist first.';
      return;
    }

    isImporting.value = true;
    importError.value = '';
    importPreview.value = null;

    try {
      const result = await resolveDecklist(importText.value);

      if (result.entries.length === 0) {
        importError.value = 'No cards could be resolved from this decklist.';
        return;
      }

      importPreview.value = result;
    } catch (error: unknown) {
      importError.value = error instanceof Error
        ? error.message
        : 'Could not resolve this decklist.';
    } finally {
      isImporting.value = false;
    }
  };

  const confirmImport = () => {
    const preview = importPreview.value;
    if (!preview || !activeDeck.value) return;

    replaceEntries(
      preview.entries,
      preview.commanderNames,
      preview.companionName
    );

    showImportDialog.value = false;
    importText.value = '';
    importPreview.value = null;
    importError.value = '';
    showNotification('Decklist imported successfully!');
  };

  const cancelImport = () => {
    showImportDialog.value = false;
    importPreview.value = null;
    importError.value = '';
  };

  return {
    showImportDialog,
    importText,
    isImporting,
    importError,
    importPreview,
    resolveImport,
    confirmImport,
    cancelImport
  };
}
