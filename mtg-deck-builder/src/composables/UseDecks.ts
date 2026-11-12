
import { ref, computed } from 'vue';
import type { Deck, MtgCard } from '../types/mtg';
import { StorageService } from '../services/Storage';
import { validateDeck } from '../services/formatRules';

const savedDecks = ref<Deck[]>([]);
const activeDeck = ref<Deck | null>(null);

function normalizeDeck(deck: Deck): Deck {
  const normalized: Deck = {
    ...deck,
    entries: Array.isArray(deck.entries) ? [...deck.entries] : [],
    format: deck.format ?? 'any',
    collectionOnly: deck.collectionOnly ?? false,
    commanderIds: deck.commanderIds ?? [],
    companionCard: deck.companionCard ?? undefined,
    oathbreakerId: deck.oathbreakerId ?? '',
    signatureSpellId: deck.signatureSpellId ?? ''
  };

  if (
    normalized.companionCard &&
    !normalized.entries.some(
      entry => entry.card.id === normalized.companionCard?.id
    )
  ) {
    normalized.entries.push({
      card: { ...normalized.companionCard },
      quantity: 1
    });
  }

  return normalized;
}

export function useDecks() {
  const loadSavedDecks = () => {
    savedDecks.value = StorageService.getDecks().map(normalizeDeck);
  };

  const replaceActiveDeckEntries = (
    entries: { card: MtgCard; quantity: number }[],
    commanderNames: string[] = [],
    companionName: string | null = null
  ) => {
    if (!activeDeck.value) return;

    const deck = activeDeck.value;

    deck.entries = entries.map(entry => ({
      card: { ...entry.card },
      quantity: entry.quantity
    }));

    deck.commanderIds = commanderNames
      .map(name =>
        deck.entries.find(
          entry =>
            entry.card.name.toLowerCase() === name.toLowerCase()
        )?.card.id
      )
      .filter((id): id is string => Boolean(id));

    deck.companionCard = companionName
      ? (() => {
          const entry = deck.entries.find(
            item =>
              item.card.name.toLowerCase() === companionName.toLowerCase()
          );

          return entry ? { ...entry.card } : undefined;
        })()
      : undefined;

    deck.updatedAt = new Date().toISOString();
  };

  const startNewDeck = (name = 'New MTG Deck') => {
    activeDeck.value = {
      id: 'deck_' + Date.now(),
      name,
      entries: [],
      updatedAt: new Date().toISOString(),
      collectionOnly: false,
      format: 'any',
      commanderIds: [],
      companionCard: undefined,
      oathbreakerId: '',
      signatureSpellId: ''
    };
  };

  const openDeck = (deck: Deck) => {
    activeDeck.value = normalizeDeck(
      JSON.parse(JSON.stringify(deck)) as Deck
    );
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

    return validateDeck(activeDeck.value).status === 'legal';
  });

  const getOwnedQuantity = (cardId: string): number =>
    StorageService.getCollectionQuantity(cardId);

  const getAllocatedQuantity = (
    cardId: string,
    excludeDeckId?: string
  ): number => {
    return savedDecks.value.reduce((total, deck) => {
      if (deck.id === excludeDeckId) return total;

      const entry = deck.entries.find(
        item => item.card.id === cardId
      );

      return total + (entry?.quantity ?? 0);
    }, 0);
  };

  const getAvailableQuantity = (cardId: string): number =>
    Math.max(
      0,
      getOwnedQuantity(cardId) - getAllocatedQuantity(cardId)
    );

  const getAvailableQuantityForActiveDeck = (
    cardId: string
  ): number => {
    const activeDeckId = activeDeck.value?.id;

    const isSavedDeck = Boolean(
      activeDeckId &&
      savedDecks.value.some(deck => deck.id === activeDeckId)
    );

    const allocated = getAllocatedQuantity(
      cardId,
      isSavedDeck ? activeDeckId : undefined
    );

    return Math.max(
      0,
      getOwnedQuantity(cardId) - allocated
    );
  };

  const canAddCardFromCollection = (
    card: MtgCard,
    copyLimit = Number.MAX_SAFE_INTEGER
  ): boolean => {
    if (!activeDeck.value) return false;

    const existing = activeDeck.value.entries.find(
      entry => entry.card.id === card.id
    );

    const currentQuantity = existing?.quantity ?? 0;

    return (
      currentQuantity < copyLimit &&
      currentQuantity < getAvailableQuantityForActiveDeck(card.id)
    );
  };

  const addCard = (
    card: MtgCard,
    collectionOnly = false,
    copyLimit = Number.MAX_SAFE_INTEGER
  ): { success: boolean; message?: string } => {
    if (!activeDeck.value) {
      return { success: false };
    }

    const existing = activeDeck.value.entries.find(
      entry => entry.card.id === card.id
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
      entry => entry.card.id === cardId
    );

    if (index === -1) return;

    if (activeDeck.value.entries[index].quantity > 1) {
      activeDeck.value.entries[index].quantity -= 1;
    } else {
      activeDeck.value.entries.splice(index, 1);
    }

    if (
      activeDeck.value.companionCard?.id === cardId &&
      !activeDeck.value.entries.some(
        entry => entry.card.id === cardId
      )
    ) {
      activeDeck.value.companionCard = undefined;
    }
  };

  const setCompanion = (
    card: MtgCard
  ): { success: boolean; message?: string } => {
    if (!activeDeck.value) {
      return { success: false, message: 'No active deck.' };
    }

    const entry = activeDeck.value.entries.find(
      item => item.card.id === card.id
    );

    if (!entry) {
      return {
        success: false,
        message: 'Add the companion card to the deck before selecting it.'
      };
    }

    activeDeck.value.companionCard = { ...entry.card };

    return { success: true };
  };

  const clearCompanion = () => {
    if (!activeDeck.value) return;

    activeDeck.value.companionCard = undefined;
  };

  const saveActiveDeck = () => {
    if (!activeDeck.value) return;

    if (!activeDeck.value.name.trim()) {
      activeDeck.value.name = 'Untitled Deck';
    }

    activeDeck.value.collectionOnly ??= false;
    activeDeck.value.format ??= 'any';
    activeDeck.value.commanderIds ??= [];
    activeDeck.value.companionCard ??= undefined;
    activeDeck.value.oathbreakerId ??= '';
    activeDeck.value.signatureSpellId ??= '';

    activeDeck.value.updatedAt = new Date().toISOString();

    StorageService.saveDeck(activeDeck.value);
    loadSavedDecks();
  };

  const deleteDeck = (deckId: string) => {
    StorageService.deleteDeck(deckId);
    loadSavedDecks();
  };

  const getShareableDecklist = (): string => {
    if (!activeDeck.value) return '';

    const deck = activeDeck.value;

    const lines: string[] = [
      `${deck.name} (${totalCardCount.value} cards)`,
      `Format: ${deck.format}`,
      '-----------------------------------'
    ];

    if (deck.commanderIds.length > 0) {
      for (const commanderId of deck.commanderIds) {
        const commander = deck.entries.find(
          entry => entry.card.id === commanderId
        );

        if (commander) {
          lines.push(`Commander: ${commander.card.name}`);
        }
      }
    }

    if (deck.companionCard) {
      lines.push(`Companion: ${deck.companionCard.name}`);
    }

    if (deck.format === 'oathbreaker') {
      const oathbreaker = deck.entries.find(
        entry => entry.card.id === deck.oathbreakerId
      );

      const signatureSpell = deck.entries.find(
        entry => entry.card.id === deck.signatureSpellId
      );

      if (oathbreaker) {
        lines.push(`Oathbreaker: ${oathbreaker.card.name}`);
      }

      if (signatureSpell) {
        lines.push(`Signature Spell: ${signatureSpell.card.name}`);
      }
    }

    lines.push('-----------------------------------');

    const excludedIds = new Set<string>([
      ...deck.commanderIds,
      ...(deck.companionCard ? [deck.companionCard.id] : []),
      ...(deck.oathbreakerId ? [deck.oathbreakerId] : []),
      ...(deck.signatureSpellId ? [deck.signatureSpellId] : [])
    ]);

    for (const entry of deck.entries) {
      let quantity = entry.quantity;

      if (excludedIds.has(entry.card.id)) {
        quantity -= 1;
      }

      if (quantity > 0) {
        lines.push(`${quantity}x ${entry.card.name}`);
      }
    }

    return lines.join('\n');
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
    setCompanion,
    clearCompanion,
    replaceActiveDeckEntries,
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
