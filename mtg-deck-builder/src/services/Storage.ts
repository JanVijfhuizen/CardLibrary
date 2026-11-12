import { Deck } from '../types/mtg';

const STORAGE_KEY = 'mtg_saved_decks_v1';

export const StorageService = {
  getDecks(): Deck[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Deck[]) : [];
    } catch (error) {
      console.error('Failed to read decks from localStorage:', error);
      return [];
    }
  },

  saveDeck(deckToSave: Deck): Deck {
    const decks = this.getDecks();
    const updatedDeck: Deck = {
      ...deckToSave,
      updatedAt: new Date().toISOString()
    };

    const existingIndex = decks.findIndex((d) => d.id === updatedDeck.id);
    if (existingIndex !== -1) {
      decks[existingIndex] = updatedDeck;
    } else {
      decks.push(updatedDeck);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
    return updatedDeck;
  },

  deleteDeck(deckId: string): void {
    const decks = this.getDecks().filter((d) => d.id !== deckId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  }
};