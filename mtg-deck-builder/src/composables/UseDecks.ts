
import { ref, computed } from 'vue';
import type { Deck, MtgCard, DeckFormat } from '../types/mtg';
import { StorageService } from '../services/Storage';

const savedDecks = ref<Deck[]>([]);
const activeDeck = ref<Deck | null>(null);

export function useDecks() {
  const loadSavedDecks = () => {
    savedDecks.value = StorageService.getDecks().map((deck) => ({
      ...deck,
      format: deck.format ?? 'standard',
      collectionOnly: deck.collectionOnly ?? false,
      commanderIds: deck.commanderIds ?? []
    }));
  };

  const startNewDeck = (name = 'New MTG Deck') => {
    activeDeck.value = {
      id: 'deck_' + Date.now(),
      name,
      entries: [],
      updatedAt: new Date().toISOString(),
      collectionOnly: false,
      format: 'standard',
      commanderIds: []
    };
  };

  const openDeck = (deck: Deck) => {
    activeDeck.value = {
      ...JSON.parse(JSON.stringify(deck)),
      collectionOnly: deck.collectionOnly ?? false,
      format: deck.format ?? 'standard',
      commanderIds: deck.commanderIds ?? []
    };
  };

  const closeDeck = () => {
    activeDeck.value = null;
    loadSavedDecks();
  };

  const totalCardCount = computed(() => {
    if (!activeDeck.value) return 0;

    return activeDeck.value.entries.reduce(
      (sum, entry) => sum + entry.quantity,
      0
    );
  });

  const isDeckValid = computed(() => {
    if (!activeDeck.value) return false;

    if (activeDeck.value.format === 'any') {
        return true;
    }

    if (activeDeck.value.format === 'commander') {
        return totalCardCount.value === 100;
    }

    return totalCardCount.value >= 60;
    });

  // Collection calculations

  const getOwnedQuantity = (cardId: string): number => {
    return StorageService.getCollectionQuantity(cardId);
  };

  const getAllocatedQuantity = (
    cardId: string,
    excludeDeckId?: string
  ): number => {
    return savedDecks.value.reduce((total, deck) => {
      if (deck.id === excludeDeckId) return total;

      const entry = deck.entries.find(
        (item) => item.card.id === cardId
      );

      return total + (entry?.quantity ?? 0);
    }, 0);
  };

  const getAvailableQuantity = (cardId: string): number => {
    return Math.max(
      0,
      getOwnedQuantity(cardId) - getAllocatedQuantity(cardId)
    );
  };

  const getAvailableQuantityForActiveDeck = (
    cardId: string
  ): number => {
    const activeDeckId = activeDeck.value?.id;

    const isSavedDeck = !!activeDeckId &&
      savedDecks.value.some((deck) => deck.id === activeDeckId);

    const allocated = getAllocatedQuantity(
      cardId,
      isSavedDeck ? activeDeckId : undefined
    );

    return Math.max(0, getOwnedQuantity(cardId) - allocated);
  };

  const canAddCardFromCollection = (
    card: MtgCard,
    copyLimit = 4
  ): boolean => {
    if (!activeDeck.value) return false;

    const existing = activeDeck.value.entries.find(
      (entry) => entry.card.id === card.id
    );

    const currentQuantity = existing?.quantity ?? 0;

    return (
      currentQuantity < copyLimit &&
      currentQuantity < getAvailableQuantityForActiveDeck(card.id)
    );
  };

  // Deck editing

  const addCard = (
    card: MtgCard,
    collectionOnly = false,
    copyLimit = 4
  ): { success: boolean; message?: string } => {
    if (!activeDeck.value) {
      return { success: false };
    }

    const existing = activeDeck.value.entries.find(
      (entry) => entry.card.id === card.id
    );

    const currentQuantity = existing?.quantity ?? 0;

    if (currentQuantity >= copyLimit) {
      return {
        success: false,
        message: `Maximum ${copyLimit} copies of "${card.name}" allowed in this format.`
      };
    }

    if (
      collectionOnly &&
      currentQuantity >= getAvailableQuantityForActiveDeck(card.id)
    ) {
      return {
        success: false,
        message: `You do not have another available copy of "${card.name}" in your collection.`
      };
    }

    if (existing) {
      existing.quantity += 1;
    } else {
      activeDeck.value.entries.push({
        card,
        quantity: 1
      });
    }

    return { success: true };
  };

  const removeCard = (cardId: string) => {
    if (!activeDeck.value) return;

    const index = activeDeck.value.entries.findIndex(
      (entry) => entry.card.id === cardId
    );

    if (index === -1) return;

    if (activeDeck.value.entries[index].quantity > 1) {
      activeDeck.value.entries[index].quantity -= 1;
    } else {
      activeDeck.value.entries.splice(index, 1);
    }
  };

  const saveActiveDeck = () => {
    if (!activeDeck.value) return;

    if (!activeDeck.value.name.trim()) {
      activeDeck.value.name = 'Untitled Deck';
    }

    activeDeck.value.collectionOnly ??= false;
    activeDeck.value.format ??= 'standard';
    activeDeck.value.commanderIds ??= [];

    StorageService.saveDeck(activeDeck.value);
    loadSavedDecks();
  };

  const deleteDeck = (deckId: string) => {
    StorageService.deleteDeck(deckId);
    loadSavedDecks();
  };

  const getShareableDecklist = (): string => {
    if (!activeDeck.value) return '';

    const header =
      `${activeDeck.value.name} (${totalCardCount.value} cards)\n` +
      `Format: ${activeDeck.value.format}\n` +
      '-----------------------------------';

    const lines = activeDeck.value.entries.map(
      (entry) => `${entry.quantity}x ${entry.card.name}`
    );

    return [header, ...lines].join('\n');
  };

  return {
    savedDecks,
    activeDeck,
    totalCardCount,
    isDeckValid,
    loadSavedDecks,
    startNewDeck,
    openDeck,
    closeDeck,
    addCard,
    removeCard,
    saveActiveDeck,
    deleteDeck,
    getOwnedQuantity,
    getAllocatedQuantity,
    getAvailableQuantity,
    getAvailableQuantityForActiveDeck,
    canAddCardFromCollection,
    getShareableDecklist
  };
}
