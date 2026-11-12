import { ref, computed } from 'vue';
import { Deck, MtgCard } from '../types/mtg';
import { StorageService } from '../services/Storage';

const savedDecks = ref<Deck[]>([]);
const activeDeck = ref<Deck | null>(null);

export function useDecks() {
  // Load all decks from localStorage
  const loadSavedDecks = () => {
    savedDecks.value = StorageService.getDecks();
  };

  // Initialize a fresh unsaved deck
  const startNewDeck = (name = 'New MTG Deck') => {
    activeDeck.value = {
      id: 'deck_' + Date.now(),
      name,
      entries: [],
      updatedAt: new Date().toISOString()
    };
  };

  // Open an existing saved deck for editing (clones object so unsaved changes don't mutate overview)
  const openDeck = (deck: Deck) => {
    activeDeck.value = JSON.parse(JSON.stringify(deck));
  };

  // Close builder and return to overview
  const closeDeck = () => {
    activeDeck.value = null;
    loadSavedDecks();
  };

  // Computed: Total card count in the active deck
  const totalCardCount = computed(() => {
    if (!activeDeck.value) return 0;
    return activeDeck.value.entries.reduce((sum, entry) => sum + entry.quantity, 0);
  });

  // Computed: Minimum 60-card rule check
  const isDeckValid = computed(() => totalCardCount.value >= 60);

  // Add a copy of a card (enforces max 4 copies rule)
  const addCard = (card: MtgCard): { success: boolean; message?: string } => {
    if (!activeDeck.value) return { success: false };

    const existing = activeDeck.value.entries.find((e) => e.card.id === card.id);
    if (existing) {
      if (existing.quantity >= 4) {
        return { success: false, message: `Maximum 4 copies of "${card.name}" allowed.` };
      }
      existing.quantity += 1;
    } else {
      activeDeck.value.entries.push({ card, quantity: 1 });
    }

    return { success: true };
  };

  // Remove a copy or delete entry if quantity drops to 0
  const removeCard = (cardId: string) => {
    if (!activeDeck.value) return;

    const index = activeDeck.value.entries.findIndex((e) => e.card.id === cardId);
    if (index === -1) return;

    if (activeDeck.value.entries[index].quantity > 1) {
      activeDeck.value.entries[index].quantity -= 1;
    } else {
      activeDeck.value.entries.splice(index, 1);
    }
  };

  // Save active deck to localStorage
  const saveActiveDeck = () => {
    if (!activeDeck.value) return;
    if (!activeDeck.value.name.trim()) {
      activeDeck.value.name = 'Untitled Deck';
    }
    StorageService.saveDeck(activeDeck.value);
    loadSavedDecks();
  };

  // Delete a saved deck from localStorage
  const deleteDeck = (deckId: string) => {
    StorageService.deleteDeck(deckId);
    loadSavedDecks();
  };

  // Generate shareable plain-text decklist
  const getShareableDecklist = (): string => {
    if (!activeDeck.value) return '';
    const header = `${activeDeck.value.name} (${totalCardCount.value} cards)\n-----------------------------------`;
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
    getShareableDecklist
  };
}