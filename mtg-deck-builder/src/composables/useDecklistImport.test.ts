import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Deck } from '../types/mtg';
import type { DecklistResolution } from '../services/Scryfall';
import { resolveDecklist } from '../services/Scryfall';
import { useDecklistImport } from './useDecklistImport';

vi.mock('../services/Scryfall', () => ({
  resolveDecklist: vi.fn()
}));

const card = {
  id: 'sol-ring',
  name: 'Sol Ring',
  type: 'Artifact',
  color: 'Colorless',
  cost: 1,
  tags: [],
  image: ''
};

function createImport() {
  const activeDeck = ref<Deck>({
    id: 'deck',
    name: 'Deck',
    entries: [],
    updatedAt: '',
    collectionOnly: false,
    format: 'any',
    commanderIds: []
  });
  const replaceEntries = vi.fn();
  const showNotification = vi.fn();

  return {
    replaceEntries,
    showNotification,
    controls: useDecklistImport({
      activeDeck,
      replaceEntries,
      showNotification
    })
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useDecklistImport', () => {
  it('requires decklist text before making a request', async () => {
    const { controls } = createImport();

    await controls.resolveImport();

    expect(controls.importError.value).toBe('Paste a decklist first.');
    expect(resolveDecklist).not.toHaveBeenCalled();
  });

  it('reports a resolved list that contains no cards', async () => {
    vi.mocked(resolveDecklist).mockResolvedValue({
      entries: [],
      commanderNames: [],
      companionName: null,
      notFound: ['Unknown']
    });
    const { controls } = createImport();
    controls.importText.value = 'Unknown';

    await controls.resolveImport();

    expect(controls.importError.value)
      .toBe('No cards could be resolved from this decklist.');
    expect(controls.importPreview.value).toBeNull();
    expect(controls.isImporting.value).toBe(false);
  });

  it('previews resolved cards and replaces the deck only after confirmation', async () => {
    const resolution: DecklistResolution = {
      entries: [{ card, quantity: 2 }],
      commanderNames: ['Sol Ring'],
      companionName: null,
      notFound: []
    };
    vi.mocked(resolveDecklist).mockResolvedValue(resolution);
    const { controls, replaceEntries, showNotification } = createImport();
    controls.importText.value = '2 Sol Ring';

    await controls.resolveImport();

    expect(controls.importPreview.value).toEqual(resolution);
    expect(replaceEntries).not.toHaveBeenCalled();

    controls.confirmImport();

    expect(replaceEntries).toHaveBeenCalledWith(
      resolution.entries,
      resolution.commanderNames,
      resolution.companionName
    );
    expect(controls.showImportDialog.value).toBe(false);
    expect(controls.importText.value).toBe('');
    expect(showNotification).toHaveBeenCalledWith(
      'Decklist imported successfully!'
    );
  });

  it('shows API errors and always clears the importing state', async () => {
    vi.mocked(resolveDecklist).mockRejectedValue(new Error('API unavailable'));
    const { controls } = createImport();
    controls.importText.value = '1 Sol Ring';

    await controls.resolveImport();

    expect(controls.importError.value).toBe('API unavailable');
    expect(controls.isImporting.value).toBe(false);
  });

  it('cancels the dialog and clears preview errors', () => {
    const { controls } = createImport();
    controls.showImportDialog.value = true;
    controls.importError.value = 'Unable to resolve.';
    controls.importPreview.value = {
      entries: [{ card, quantity: 1 }],
      commanderNames: [],
      companionName: null,
      notFound: []
    };

    controls.cancelImport();

    expect(controls.showImportDialog.value).toBe(false);
    expect(controls.importError.value).toBe('');
    expect(controls.importPreview.value).toBeNull();
  });
});
