import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MtgCard } from '../types/mtg';
import { useDecks } from './UseDecks';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const solRing: MtgCard = {
  id: 'sol-ring',
  name: 'Sol Ring',
  type: 'Artifact',
  color: 'Colorless',
  cost: 1,
  tags: [],
  image: '',
  legalities: { commander: 'legal' }
};

describe('useDecks', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    useDecks().closeDeck();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates, opens, and closes decks with a zero initial count', () => {
    const store = useDecks();
    store.startNewDeck('Test Deck');

    expect(store.activeDeck.value?.name).toBe('Test Deck');
    expect(store.totalCardCount.value).toBe(0);
    expect(store.isDeckValid.value).toBe(true);

    store.closeDeck();
    expect(store.activeDeck.value).toBeNull();
  });

  it('adds and removes card quantities while maintaining the total', () => {
    const store = useDecks();
    store.startNewDeck();

    expect(store.addCard(solRing).success).toBe(true);
    expect(store.addCard(solRing).success).toBe(true);
    expect(store.totalCardCount.value).toBe(2);

    store.removeCard(solRing.id);
    expect(store.activeDeck.value?.entries[0].quantity).toBe(1);
    store.removeCard(solRing.id);
    expect(store.activeDeck.value?.entries).toEqual([]);
  });

  it('enforces a card copy limit before changing the deck', () => {
    const store = useDecks();
    store.startNewDeck();
    store.addCard(solRing, false, 1);

    expect(store.addCard(solRing, false, 1)).toEqual({
      success: false,
      message: 'Maximum 1 copies of "Sol Ring" allowed in this format.'
    });
    expect(store.totalCardCount.value).toBe(1);
  });

  it('limits collection-only additions to unallocated owned copies', () => {
    const store = useDecks();
    store.startNewDeck();
    store.saveActiveDeck();

    expect(store.addCard(solRing, true).success).toBe(false);
    expect(store.addCard(solRing, true).message)
      .toContain('do not have another available copy');
    expect(store.totalCardCount.value).toBe(0);
  });

  it('allocates owned copies across saved decks and excludes the active deck', () => {
    const store = useDecks();
    store.startNewDeck('First');
    store.addCard(solRing);
    store.saveActiveDeck();
    const firstDeck = store.savedDecks.value[0];

    store.startNewDeck('Second');
    expect(store.getAllocatedQuantity(solRing.id)).toBe(1);
    expect(store.getAvailableQuantity(solRing.id)).toBe(0);
    expect(store.getAvailableQuantityForActiveDeck(solRing.id)).toBe(0);

    store.openDeck(firstDeck);
    expect(store.getAvailableQuantityForActiveDeck(solRing.id)).toBe(0);
  });

  it('keeps companion and commander references in sync with deck entries', () => {
    const store = useDecks();
    const commander: MtgCard = {
      ...solRing,
      id: 'commander',
      name: 'Commander'
    };
    const companion: MtgCard = {
      ...solRing,
      id: 'companion',
      name: 'Companion'
    };
    store.startNewDeck();
    store.addCard(commander);
    store.addCard(companion);

    expect(store.setCompanion(companion).success).toBe(true);
    store.replaceActiveDeckEntries([
      { card: commander, quantity: 1 },
      { card: companion, quantity: 1 }
    ], ['Commander'], 'Companion');
    expect(store.activeDeck.value?.commanderIds).toEqual(['commander']);
    expect(store.activeDeck.value?.companionCard?.id).toBe('companion');

    store.removeCard(companion.id);
    expect(store.activeDeck.value?.companionCard).toBeUndefined();
  });

  it('normalizes and persists a blank deck name on save', () => {
    const store = useDecks();
    store.startNewDeck('   ');
    store.saveActiveDeck();

    expect(store.activeDeck.value?.name).toBe('Untitled Deck');
    expect(store.savedDecks.value[0].name).toBe('Untitled Deck');
  });

  it('exports commander and companion roles without duplicating their role copies', () => {
    const store = useDecks();
    const commander: MtgCard = {
      ...solRing,
      id: 'commander',
      name: 'Commander'
    };
    const companion: MtgCard = {
      ...solRing,
      id: 'companion',
      name: 'Companion'
    };
    store.startNewDeck('Role Deck');
    store.addCard(commander);
    store.addCard(companion);
    store.replaceActiveDeckEntries([
      { card: commander, quantity: 1 },
      { card: companion, quantity: 1 },
      { card: solRing, quantity: 2 }
    ], ['Commander'], 'Companion');
    store.activeDeck.value!.format = 'commander';

    expect(store.getShareableDecklist()).toContain('Role Deck (4 cards)');
    expect(store.getShareableDecklist()).toContain('Commander: Commander');
    expect(store.getShareableDecklist()).toContain('Companion: Companion');
    expect(store.getShareableDecklist()).toContain('2x Sol Ring');
    expect(store.getShareableDecklist()).not.toContain('1x Commander');
    expect(store.getShareableDecklist()).not.toContain('1x Companion');
  });
});
