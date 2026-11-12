
import type { Deck, MtgCard, CollectionEntry } from '../types/mtg';

const DECKS_STORAGE_KEY = 'mtg_saved_decks_v1';
const COLLECTION_STORAGE_KEY = 'mtg_collection_v1';

export const StorageService = {
  // -----------------------------
  // Deck storage
  // -----------------------------

  getDecks(): Deck[] {
    try {
      const raw = localStorage.getItem(DECKS_STORAGE_KEY);
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

    const existingIndex = decks.findIndex(
      (deck) => deck.id === updatedDeck.id
    );

    if (existingIndex !== -1) {
      decks[existingIndex] = updatedDeck;
    } else {
      decks.push(updatedDeck);
    }

    try {
      localStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
    } catch (error) {
      console.error('Failed to save deck to localStorage:', error);
      throw error;
    }

    return updatedDeck;
  },

  deleteDeck(deckId: string): void {
    const decks = this.getDecks().filter(
      (deck) => deck.id !== deckId
    );

    try {
      localStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
    } catch (error) {
      console.error('Failed to delete deck from localStorage:', error);
      throw error;
    }
  },

  // -----------------------------
  // Collection storage
  // -----------------------------

  getCollection(): CollectionEntry[] {
    try {
      const raw = localStorage.getItem(COLLECTION_STORAGE_KEY);

      if (!raw) {
        return [];
      }

      const collection = JSON.parse(raw) as CollectionEntry[];

      if (!Array.isArray(collection)) {
        return [];
      }

      return collection.filter(
        (entry) =>
          entry &&
          entry.card &&
          typeof entry.card.id === 'string' &&
          typeof entry.quantity === 'number' &&
          entry.quantity > 0
      );
    } catch (error) {
      console.error('Failed to read collection from localStorage:', error);
      return [];
    }
  },

  /**
   * Set the total number of physical copies owned.
   * A quantity of zero removes the card from the collection.
   */
  setCollectionQuantity(card: MtgCard, quantity: number): CollectionEntry[] {
    const collection = this.getCollection();

    const safeQuantity = Math.max(
      0,
      Math.floor(Number(quantity) || 0)
    );

    const existingIndex = collection.findIndex(
      (entry) => entry.card.id === card.id
    );

    if (safeQuantity === 0) {
      if (existingIndex !== -1) {
        collection.splice(existingIndex, 1);
      }
    } else {
      const updatedEntry: CollectionEntry = {
        card: { ...card },
        quantity: safeQuantity
      };

      if (existingIndex !== -1) {
        collection[existingIndex] = updatedEntry;
      } else {
        collection.push(updatedEntry);
      }
    }

    try {
      localStorage.setItem(
        COLLECTION_STORAGE_KEY,
        JSON.stringify(collection)
      );
    } catch (error) {
      console.error('Failed to save collection to localStorage:', error);
      throw error;
    }

    return collection;
  },

  getCollectionQuantity(cardId: string): number {
    const entry = this.getCollection().find(
      (item) => item.card.id === cardId
    );

    return entry?.quantity ?? 0;
  },

  removeFromCollection(cardId: string): CollectionEntry[] {
    const collection = this.getCollection().filter(
      (entry) => entry.card.id !== cardId
    );

    try {
      localStorage.setItem(
        COLLECTION_STORAGE_KEY,
        JSON.stringify(collection)
      );
    } catch (error) {
      console.error('Failed to remove card from collection:', error);
      throw error;
    }

    return collection;
  }
};
