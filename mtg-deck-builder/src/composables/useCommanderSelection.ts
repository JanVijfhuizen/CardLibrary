import { computed } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import type { Deck, DeckEntry, DeckFormat, MtgCard } from '../types/mtg';
import { isCommanderFormat } from '../services/formatRules';

interface CommanderSelectionOptions {
  activeDeck: Ref<Deck | null>;
  currentFormat: ComputedRef<DeckFormat>;
  getDeckCopyLimit: (card: MtgCard) => number;
  getAvailableQuantity: (cardId: string) => number;
  setCompanion: (card: MtgCard) => { success: boolean; message?: string };
  clearCompanion: () => void;
  showNotification: (message: string, type?: 'success' | 'error') => void;
}

function isBackground(card: MtgCard): boolean {
  return /\blegendary enchantment.*\bbackground\b/i.test(card.type);
}

function hasKeyword(card: MtgCard, keyword: string): boolean {
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return (
    (card.tags ?? []).some(
      item => item.toLowerCase() === keyword.toLowerCase()
    ) ||
    new RegExp(`\\b${escapedKeyword}\\b`, 'i').test(card.oracleText ?? '')
  );
}

function hasPartnerWith(card: MtgCard, other: MtgCard): boolean {
  const match = (card.oracleText ?? '').match(
    /partner with\s+([^(.\n]+)/i
  );

  return Boolean(
    match &&
    match[1].trim().toLowerCase() === other.name.trim().toLowerCase()
  );
}

function isDoctor(card: MtgCard): boolean {
  return /\bDoctor\b/i.test(card.type);
}

function canPairCommanders(first: MtgCard, second: MtgCard): boolean {
  if (first.id === second.id) return false;

  if (
    (hasKeyword(first, 'Partner') && hasKeyword(second, 'Partner')) ||
    (hasKeyword(first, 'Friends forever') &&
      hasKeyword(second, 'Friends forever')) ||
    hasPartnerWith(first, second) ||
    hasPartnerWith(second, first) ||
    (hasKeyword(first, 'Choose a Background') && isBackground(second)) ||
    (hasKeyword(second, 'Choose a Background') && isBackground(first)) ||
    (hasKeyword(first, "Doctor's companion") && isDoctor(second)) ||
    (hasKeyword(second, "Doctor's companion") && isDoctor(first))
  ) {
    return true;
  }

  return false;
}

export function useCommanderSelection({
  activeDeck,
  currentFormat,
  getDeckCopyLimit,
  getAvailableQuantity,
  setCompanion,
  clearCompanion,
  showNotification
}: CommanderSelectionOptions) {
  const getTotalCopiesByName = (cardName: string): number => {
    if (!activeDeck.value) return 0;

    return activeDeck.value.entries
      .filter(
        entry => entry.card.name.toLowerCase() === cardName.toLowerCase()
      )
      .reduce((total, entry) => total + entry.quantity, 0);
  };

  const getCopyLimitShortage = (entry: DeckEntry): number => {
    return Math.max(
      0,
      getTotalCopiesByName(entry.card.name) - getDeckCopyLimit(entry.card)
    );
  };

  const isCommanderEligible = (card: MtgCard): boolean => {
    const type = card.type.toLowerCase();
    const oracle = (card.oracleText ?? '').toLowerCase();

    if (
      currentFormat.value === 'brawl' ||
      currentFormat.value === 'historicbrawl' ||
      currentFormat.value === 'standardbrawl'
    ) {
      return (
        (type.includes('legendary') &&
          (type.includes('creature') || type.includes('planeswalker'))) ||
        oracle.includes('can be your commander')
      );
    }

    if (currentFormat.value === 'paupercommander') {
      return type.includes('creature') && card.rarity === 'uncommon';
    }

    if (isBackground(card)) return false;

    return (
      oracle.includes('can be your commander') ||
      (type.includes('legendary') && type.includes('creature'))
    );
  };

  const isValidSecondCommanderCard = (card: MtgCard): boolean => {
    return isCommanderEligible(card) || isBackground(card);
  };

  const getPairingMechanic = (
    first: MtgCard,
    second: MtgCard
  ): string => {
    if (hasKeyword(first, 'Partner') && hasKeyword(second, 'Partner')) {
      return 'Partner';
    }

    if (
      hasKeyword(first, 'Friends forever') &&
      hasKeyword(second, 'Friends forever')
    ) {
      return 'Friends forever';
    }

    if (hasPartnerWith(first, second) || hasPartnerWith(second, first)) {
      return 'Partner with';
    }

    if (
      (hasKeyword(first, 'Choose a Background') && isBackground(second)) ||
      (hasKeyword(second, 'Choose a Background') && isBackground(first))
    ) {
      return 'Choose a Background';
    }

    if (
      (hasKeyword(first, "Doctor's companion") && isDoctor(second)) ||
      (hasKeyword(second, "Doctor's companion") && isDoctor(first))
    ) {
      return "Doctor's companion";
    }

    return '';
  };

  const commanderCandidates = computed(() => {
    if (!activeDeck.value) return [];

    const uniqueCards = new Map<string, MtgCard>();

    activeDeck.value.entries.forEach(({ card }) => {
      if (isCommanderEligible(card)) uniqueCards.set(card.id, card);
    });

    return [...uniqueCards.values()];
  });

  const companionCandidates = computed(() => {
    if (!activeDeck.value) return [];

    const uniqueCards = new Map<string, MtgCard>();

    activeDeck.value.entries.forEach(({ card }) => {
      if (hasKeyword(card, 'Companion')) uniqueCards.set(card.id, card);
    });

    return [...uniqueCards.values()];
  });

  const selectedCompanion = computed(
    () => activeDeck.value?.companionCard ?? null
  );

  const selectedCompanionId = computed({
    get: () => selectedCompanion.value?.id ?? '',
    set: (value: string) => {
      if (!value) {
        clearCompanion();
        return;
      }

      const card = companionCandidates.value.find(
        candidate => candidate.id === value
      );

      if (!card) return;

      const result = setCompanion(card);

      if (!result.success && result.message) {
        showNotification(result.message, 'error');
      }
    }
  });

  const selectedCommanderId = computed({
    get: () => activeDeck.value?.commanderIds?.[0] ?? '',
    set: (value: string) => {
      if (!activeDeck.value) return;

      const secondId = activeDeck.value.commanderIds?.[1] ?? '';

      if (!value) {
        activeDeck.value.commanderIds = [];
        return;
      }

      const firstCard = activeDeck.value.entries.find(
        entry => entry.card.id === value
      )?.card;
      const secondCard = activeDeck.value.entries.find(
        entry => entry.card.id === secondId
      )?.card;

      activeDeck.value.commanderIds =
        firstCard && secondCard && canPairCommanders(firstCard, secondCard)
          ? [value, secondId]
          : [value];
    }
  });

  const selectedCommander = computed(() => {
    if (!activeDeck.value || !selectedCommanderId.value) return null;

    return activeDeck.value.entries.find(
      entry => entry.card.id === selectedCommanderId.value
    )?.card ?? null;
  });

  const compatibleSecondCommanders = computed(() => {
    const first = selectedCommander.value;
    if (!activeDeck.value || !first) return [];

    return activeDeck.value.entries
      .map(entry => entry.card)
      .filter(card =>
        isValidSecondCommanderCard(card) &&
        card.id !== selectedCommanderId.value &&
        canPairCommanders(first, card)
      )
      .filter(
        (card, index, list) =>
          list.findIndex(item => item.id === card.id) === index
      );
  });

  const secondCommanderId = computed({
    get: () => activeDeck.value?.commanderIds?.[1] ?? '',
    set: (value: string) => {
      if (!activeDeck.value) return;

      if (!value) {
        activeDeck.value.commanderIds = selectedCommanderId.value
          ? [selectedCommanderId.value]
          : [];
        return;
      }

      if (!compatibleSecondCommanders.value.some(card => card.id === value)) {
        return;
      }

      activeDeck.value.commanderIds = [selectedCommanderId.value, value];
    }
  });

  const selectedCommanders = computed(() => {
    if (!activeDeck.value) return [];

    return (activeDeck.value.commanderIds ?? [])
      .map(id =>
        activeDeck.value?.entries.find(entry => entry.card.id === id)?.card
      )
      .filter((card): card is MtgCard => Boolean(card));
  });

  const combinedCommanderIdentity = computed(() => {
    return new Set(
      selectedCommanders.value.flatMap(
        commander => commander.colorIdentity ?? []
      )
    );
  });

  const hasCommanderIdentityViolation = (card: MtgCard): boolean => {
    if (currentFormat.value !== 'commander') return false;
    if (selectedCommanders.value.length === 0) return false;

    return (card.colorIdentity ?? []).some(
      color => !combinedCommanderIdentity.value.has(color)
    );
  };

  const getDeckEntryWarnings = (entry: DeckEntry): string[] => {
    if (currentFormat.value === 'any') return [];

    const warnings: string[] = [];
    const legality = entry.card.legalities?.[currentFormat.value] ?? 'unknown';

    if (legality === 'banned') {
      warnings.push(`BANNED IN ${currentFormat.value.toUpperCase()}`);
    } else if (legality === 'not_legal') {
      warnings.push(`NOT LEGAL IN ${currentFormat.value.toUpperCase()}`);
    } else if (legality === 'restricted') {
      warnings.push('RESTRICTED');
    }

    const limit = getDeckCopyLimit(entry.card);

    if (getCopyLimitShortage(entry) > 0) {
      warnings.push(`COPY LIMIT: ${limit} MAXIMUM`);
    }

    if (
      isCommanderFormat(currentFormat.value) &&
      hasCommanderIdentityViolation(entry.card)
    ) {
      warnings.push('COLOR IDENTITY VIOLATION');
    }

    return warnings;
  };

  const getDeckEntryShortage = (entry: DeckEntry): number => {
    return Math.max(
      0,
      entry.quantity - getAvailableQuantity(entry.card.id)
    );
  };

  return {
    commanderCandidates,
    companionCandidates,
    selectedCompanion,
    selectedCompanionId,
    selectedCommanderId,
    selectedCommander,
    compatibleSecondCommanders,
    secondCommanderId,
    selectedCommanders,
    getPairingMechanic,
    getDeckEntryWarnings,
    getDeckEntryShortage
  };
}
