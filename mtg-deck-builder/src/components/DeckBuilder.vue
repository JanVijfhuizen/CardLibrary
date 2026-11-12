
<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import { useDecks } from '../composables/UseDecks';
import { useScryfallAPI, resolveDecklist } from '../services/Scryfall';
import { StorageService } from '../services/Storage';
import type {
  CardFilters,
  MtgCard,
  CollectionEntry,
  DeckEntry,
  DeckFormat
} from '../types/mtg';
import {
  FORMAT_OPTIONS,
  getCardCopyLimit,
  validateDeck,
  isCommanderFormat
} from '../services/formatRules';

const {
  activeDeck,
  totalCardCount,
  closeDeck,
  addCard,
  removeCard,
  saveActiveDeck,
  getShareableDecklist,
  getAvailableQuantityForActiveDeck,
  canAddCardFromCollection,
  setCompanion,
  clearCompanion,
  replaceActiveDeckEntries
} = useDecks();

const {
  cards,
  searchCards,
  loadMore,
  hasMore,
  isLoading,
  isLoadingMore,
  error
} = useScryfallAPI();

const filters = ref<CardFilters>({
  query: '',
  color: '',
  type: '',
  minCost: 0,
  maxCost: null
});

// Adjustable grid columns: default 6, minimum 3, maximum 6.
const MIN_COLUMNS = 3;
const MAX_COLUMNS = 6;

const clampColumns = (value: number): number => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 6;

  return Math.min(
    MAX_COLUMNS,
    Math.max(MIN_COLUMNS, Math.round(parsed))
  );
};

const getSavedColumns = (key: string): number => {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? 6 : clampColumns(Number(saved));
  } catch {
    return 6;
  }
};

const searchColumns = ref(
  getSavedColumns('mtg_search_columns')
);

const deckColumns = ref(
  getSavedColumns('mtg_deck_columns')
);

const saveColumns = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(clampColumns(value)));
  } catch (error) {
    console.error('Could not save grid column setting:', error);
  }
};

const changeSearchColumns = (amount: number) => {
  searchColumns.value = clampColumns(searchColumns.value + amount);
};

const changeDeckColumns = (amount: number) => {
  deckColumns.value = clampColumns(deckColumns.value + amount);
};

const validateSearchColumns = () => {
  searchColumns.value = clampColumns(searchColumns.value);
};

const validateDeckColumns = () => {
  deckColumns.value = clampColumns(deckColumns.value);
};

watch(
  searchColumns,
  (value) => saveColumns('mtg_search_columns', value),
  { immediate: true }
);

watch(
  deckColumns,
  (value) => saveColumns('mtg_deck_columns', value),
  { immediate: true }
);

const collectionOnly = computed({
  get: () => activeDeck.value?.collectionOnly ?? false,
  set: (value: boolean) => {
    if (activeDeck.value) {
      activeDeck.value.collectionOnly = value;
    }
  }
});

const collectionEntries = ref<CollectionEntry[]>([]);

const loadCollection = () => {
  collectionEntries.value = StorageService.getCollection();
};

const refreshCollectionLegality = async () => {
  const entries = collectionEntries.value;

  if (entries.length === 0) return;

  const uniqueIds = [
    ...new Set(
      entries
        .map((entry) => entry.card.id)
        .filter(Boolean)
    )
  ];

  const refreshedCards = new Map<string, any>();

  try {
    for (let i = 0; i < uniqueIds.length; i += 75) {
      const batch = uniqueIds.slice(i, i + 75);

      const response = await fetch(
        'https://api.scryfall.com/cards/collection',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            identifiers: batch.map((id) => ({ id }))
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Scryfall API error (${response.status})`);
      }

      const data = await response.json();

      for (const card of data.data ?? []) {
        refreshedCards.set(card.id, card);
      }
    }

    const updateCard = (card: MtgCard): MtgCard => {
      const freshCard = refreshedCards.get(card.id);

      if (!freshCard) return card;

      return {
        ...card,
        legalities: freshCard.legalities ?? card.legalities ?? {},
        colorIdentity:
          freshCard.color_identity ?? card.colorIdentity ?? [],
        oracleText:
          freshCard.oracle_text ?? card.oracleText ?? '',
        tags: freshCard.keywords ?? card.tags ?? []
      };
    };

    collectionEntries.value = collectionEntries.value.map((entry) => ({
      ...entry,
      card: updateCard(entry.card)
    }));

    if (activeDeck.value) {
      activeDeck.value.entries.forEach((entry) => {
        entry.card = updateCard(entry.card);
      });
    }
  } catch (err) {
    console.error('Could not refresh collection legality:', err);
  }
};

watch(collectionOnly, async (enabled) => {
  if (enabled) {
    loadCollection();
    await refreshCollectionLegality();
  }
});

// Notifications.
const notification = ref({
  message: '',
  type: 'success' as 'success' | 'error'
});

let notificationTimeout: ReturnType<typeof setTimeout> | null = null;

const showNotification = (
  message: string,
  type: 'success' | 'error' = 'success'
) => {
  notification.value = { message, type };

  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }

  notificationTimeout = setTimeout(() => {
    notification.value.message = '';
  }, 3000);
};

// Format helpers.
const currentFormat = computed<DeckFormat>(
  () => activeDeck.value?.format ?? 'standard'
);

const getFormatLegality = (card: MtgCard): string => {
  if (currentFormat.value === 'any') return 'legal';

  return card.legalities?.[currentFormat.value] ?? 'unknown';
};

const getFormatWarning = (card: MtgCard): string => {
  const legality = getFormatLegality(card);

  if (legality === 'banned') return 'BANNED!';
  if (legality === 'not_legal') return 'ILLEGAL!';

  return '';
};

const isBasicLand = (card: MtgCard): boolean => {
  return /\bBasic\b/i.test(card.type);
};

const canHaveAnyNumber = (card: MtgCard): boolean => {
  return /a deck can have any number of cards named/i.test(
    card.oracleText ?? ''
  );
};

const getDeckCopyLimit = (card: MtgCard): number => {
  return getCardCopyLimit(card, currentFormat.value);
};

const getTotalCopiesByName = (cardName: string): number => {
  if (!activeDeck.value) return 0;

  return activeDeck.value.entries
    .filter(
      (entry) =>
        entry.card.name.toLowerCase() === cardName.toLowerCase()
    )
    .reduce((total, entry) => total + entry.quantity, 0);
};

const getCopyLimitShortage = (entry: DeckEntry): number => {
  const limit = getDeckCopyLimit(entry.card);
  const total = getTotalCopiesByName(entry.card.name);

  return Math.max(0, total - limit);
};

// Commander helpers.
const isBackground = (card: MtgCard): boolean => {
  return /\blegendary enchantment.*\bbackground\b/i.test(card.type);
};

function hasKeyword(card: MtgCard, keyword: string): boolean {
  const keywordPattern = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return (
    (card.tags ?? []).some(
      item => item.toLowerCase() === keyword.toLowerCase()
    ) ||
    new RegExp(`\\b${keywordPattern}\\b`, 'i').test(
      card.oracleText ?? ''
    )
  );
}

function hasPartnerWith(
  card: MtgCard,
  other: MtgCard
): boolean {
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

function canPairCommanders(
  first: MtgCard,
  second: MtgCard
): boolean {
  if (first.id === second.id) return false;

  if (
    hasKeyword(first, 'Partner') &&
    hasKeyword(second, 'Partner')
  ) {
    return true;
  }

  if (
    hasKeyword(first, 'Friends forever') &&
    hasKeyword(second, 'Friends forever')
  ) {
    return true;
  }

  if (
    hasPartnerWith(first, second) ||
    hasPartnerWith(second, first)
  ) {
    return true;
  }

  if (
    (hasKeyword(first, 'Choose a Background') &&
      isBackground(second)) ||
    (hasKeyword(second, 'Choose a Background') &&
      isBackground(first))
  ) {
    return true;
  }

  if (
    (hasKeyword(first, "Doctor's companion") &&
      isDoctor(second)) ||
    (hasKeyword(second, "Doctor's companion") &&
      isDoctor(first))
  ) {
    return true;
  }

  return false;
}

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
  if (
    hasKeyword(first, 'Partner') &&
    hasKeyword(second, 'Partner')
  ) {
    return 'Partner';
  }

  if (
    hasKeyword(first, 'Friends forever') &&
    hasKeyword(second, 'Friends forever')
  ) {
    return 'Friends forever';
  }

  if (
    hasPartnerWith(first, second) ||
    hasPartnerWith(second, first)
  ) {
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

  activeDeck.value.entries.forEach((entry) => {
    if (isCommanderEligible(entry.card)) {
      uniqueCards.set(entry.card.id, entry.card);
    }
  });

  return [...uniqueCards.values()];
});

// Companion selection.
const companionCandidates = computed(() => {
  if (!activeDeck.value) return [];

  const uniqueCards = new Map<string, MtgCard>();

  activeDeck.value.entries.forEach((entry) => {
    if (hasKeyword(entry.card, 'Companion')) {
      uniqueCards.set(entry.card.id, entry.card);
    }
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
      (candidate) => candidate.id === value
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
      (entry) => entry.card.id === value
    )?.card;

    const secondCard = activeDeck.value.entries.find(
      (entry) => entry.card.id === secondId
    )?.card;

    const keepSecond =
      firstCard &&
      secondCard &&
      canPairCommanders(firstCard, secondCard);

    activeDeck.value.commanderIds = keepSecond
      ? [value, secondId]
      : [value];
  }
});

const selectedCommander = computed(() => {
  if (!activeDeck.value || !selectedCommanderId.value) return null;

  return activeDeck.value.entries.find(
    (entry) => entry.card.id === selectedCommanderId.value
  )?.card ?? null;
});

const compatibleSecondCommanders = computed(() => {
  if (!activeDeck.value || !selectedCommander.value) return [];

  return activeDeck.value.entries
    .map((entry) => entry.card)
    .filter((card) => {
      if (!isValidSecondCommanderCard(card)) return false;
      if (card.id === selectedCommanderId.value) return false;

      return canPairCommanders(selectedCommander.value!, card);
    })
    .filter(
      (card, index, list) =>
        list.findIndex((item) => item.id === card.id) === index
    );
});

const canSelectSecondCommander = computed(
  () => compatibleSecondCommanders.value.length > 0
);

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

    const isCompatible = compatibleSecondCommanders.value.some(
      (card) => card.id === value
    );

    if (!isCompatible) return;

    activeDeck.value.commanderIds = [
      selectedCommanderId.value,
      value
    ];
  }
});

const selectedCommanders = computed(() => {
  if (!activeDeck.value) return [];

  return (activeDeck.value.commanderIds ?? [])
    .map((id) =>
      activeDeck.value?.entries.find(
        (entry) => entry.card.id === id
      )?.card
    )
    .filter((card): card is MtgCard => Boolean(card));
});

const commanderPairValid = computed(() => {
  const commanders = selectedCommanders.value;
  const ids = activeDeck.value?.commanderIds ?? [];

  if (ids.length === 0) return true;

  if (ids.length === 1) {
    return (
      commanders.length === 1 &&
      isCommanderEligible(commanders[0])
    );
  }

  if (ids.length === 2) {
    return (
      commanders.length === 2 &&
      isCommanderEligible(commanders[0]) &&
      isValidSecondCommanderCard(commanders[1]) &&
      canPairCommanders(commanders[0], commanders[1])
    );
  }

  return false;
});

const combinedCommanderIdentity = computed(() => {
  const identity = new Set<string>();

  selectedCommanders.value.forEach((commander) => {
    (commander.colorIdentity ?? []).forEach((color) => {
      identity.add(color);
    });
  });

  return identity;
});

const hasCommanderIdentityViolation = (card: MtgCard): boolean => {
  if (currentFormat.value !== 'commander') return false;
  if (selectedCommanders.value.length === 0) return false;

  return (card.colorIdentity ?? []).some(
    (color) => !combinedCommanderIdentity.value.has(color)
  );
};

// Card-level validation.
const getDeckEntryWarnings = (entry: DeckEntry): string[] => {
  const warnings: string[] = [];

  if (currentFormat.value === 'any') return warnings;

  const legality = getFormatLegality(entry.card);
  const formatName = currentFormat.value.toUpperCase();

  if (legality === 'banned') {
    warnings.push(`BANNED IN ${formatName}`);
  } else if (legality === 'not_legal') {
    warnings.push(`NOT LEGAL IN ${formatName}`);
  } else if (legality === 'restricted') {
    warnings.push('RESTRICTED');
  }

  if (getCopyLimitShortage(entry) > 0) {
    warnings.push(
      `COPY LIMIT: ${getDeckCopyLimit(entry.card)} MAXIMUM`
    );
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
  const available = getAvailableQuantityForActiveDeck(entry.card.id);
  return Math.max(0, entry.quantity - available);
};

const normalizeColor = (color: string): string => {
  const value = (color || '').toLowerCase();

  const letters = value
    .replace(/white/g, 'W')
    .replace(/blue/g, 'U')
    .replace(/black/g, 'B')
    .replace(/red/g, 'R')
    .replace(/green/g, 'G')
    .toUpperCase()
    .replace(/[^WUBRG]/g, '');

  return [...new Set(letters)].sort().join('');
};

const matchesLocalFilters = (card: MtgCard): boolean => {
  const query = filters.value.query.trim().toLowerCase();

  if (query && !card.name.toLowerCase().includes(query)) return false;

  if (filters.value.color) {
    const cardColor = normalizeColor(card.color);

    if (filters.value.color === 'C') {
      if (cardColor !== '') return false;
    } else {
      const selectedColor = [...filters.value.color].sort().join('');
      if (cardColor !== selectedColor) return false;
    }
  }

  if (
    filters.value.type &&
    !card.type.toLowerCase().includes(filters.value.type.toLowerCase())
  ) {
    return false;
  }

  if (
    filters.value.minCost !== null &&
    card.cost < filters.value.minCost
  ) {
    return false;
  }

  if (
    filters.value.maxCost !== null &&
    card.cost > filters.value.maxCost
  ) {
    return false;
  }

  return true;
};

const displayedCards = computed(() => {
  const sourceCards = collectionOnly.value
    ? collectionEntries.value.map((entry) => entry.card)
    : cards.value;

  return sourceCards.filter((card) => {
    if (currentFormat.value !== 'any') {
      const legality = getFormatLegality(card);

      if (legality === 'banned' || legality === 'not_legal') return false;
    }

    if (collectionOnly.value) {
      const alreadyInDeck = activeDeck.value?.entries.some(
        (deckEntry) => deckEntry.card.id === card.id
      ) ?? false;

      const available = getAvailableQuantityForActiveDeck(card.id);

      if (available <= 0 && !alreadyInDeck) return false;
    }

    return matchesLocalFilters(card);
  });
});

// Overall deck validation.
const deckValidation = computed(() => {
  if (!activeDeck.value) {
    return {
      status: 'illegal' as const,
      issues: [],
      unknownCards: []
    };
  }

  return validateDeck(activeDeck.value);
});

const deckIssues = computed(() => {
  const result = deckValidation.value;

  const unknownIssues = result.unknownCards.map(
    (name) => `Legality data is missing for ${name}.`
  );

  return [...result.issues, ...unknownIssues];
});

const showDeckIssues = ref(false);
const showCommanderSettings = ref(false);
const showCompanionSettings = ref(false);

const deckIsLegal = computed(
  () => deckValidation.value.status === 'legal'
);

// Search and filters.
const clearFilters = () => {
  filters.value = {
    query: '',
    color: '',
    type: '',
    minCost: 0,
    maxCost: null
  };
};

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  loadCollection();

  if (collectionOnly.value) {
    await refreshCollectionLegality();
  } else {
    await searchCards(filters.value);
  }
});

watch(
  filters,
  (newFilters) => {
    if (searchTimeout) clearTimeout(searchTimeout);
    if (collectionOnly.value) return;

    searchTimeout = setTimeout(() => {
      searchCards({ ...newFilters });
    }, 350);
  },
  { deep: true }
);

// Card actions.
const handleAdd = (card: MtgCard) => {
  const result = addCard(
    card,
    collectionOnly.value,
    getDeckCopyLimit(card)
  );

  if (!result.success && result.message) {
    showNotification(result.message, 'error');
  }
};

// Manually change the quantity of a card in the deck.
const handleQuantityChange = (
  entry: DeckEntry,
  event: Event
) => {
  const input = event.target as HTMLInputElement;
  const parsed = Number(input.value);

  // Reject empty, invalid, negative, or non-integer values.
  if (
    input.value.trim() === '' ||
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    !Number.isInteger(parsed)
  ) {
    input.value = String(entry.quantity);
    return;
  }

  const targetQuantity = parsed;
  const currentQuantity = entry.quantity;
  const cardId = entry.card.id;

  if (targetQuantity === currentQuantity) return;

  // Remove commander/companion references if the card is removed.
  if (targetQuantity === 0 && activeDeck.value) {
    activeDeck.value.commanderIds =
      activeDeck.value.commanderIds.filter(
        (id) => id !== cardId
      );

    if (selectedCompanion.value?.id === cardId) {
      clearCompanion();
    }
  }

  if (targetQuantity > currentQuantity) {
    // Add copies one at a time, respecting existing restrictions.
    for (let i = currentQuantity; i < targetQuantity; i++) {
      const result = addCard(
        entry.card,
        collectionOnly.value,
        getDeckCopyLimit(entry.card)
      );

      if (!result.success) {
        if (result.message) {
          showNotification(result.message, 'error');
        }
        break;
      }
    }
  } else {
    // Remove copies until the requested quantity is reached.
    for (let i = currentQuantity; i > targetQuantity; i--) {
      removeCard(cardId);
    }
  }

  // Restore the displayed value to the actual deck quantity.
  const updatedEntry = activeDeck.value?.entries.find(
    (item) => item.card.id === cardId
  );

  input.value = String(updatedEntry?.quantity ?? 0);
};

const getCardInventoryText = (card: MtgCard): string => {
  return `Available: ${getAvailableQuantityForActiveDeck(card.id)}`;
};

const handleSave = () => {
  saveActiveDeck();

  if (deckIsLegal.value) {
    showNotification('Deck saved successfully!');
  } else {
    showNotification(
      'Deck saved, but it has format rule violations.',
      'error'
    );
  }
};

const handleShare = async () => {
  const decklistText = getShareableDecklist();

  try {
    await navigator.clipboard.writeText(decklistText);
    showNotification('Decklist copied to clipboard!');
  } catch {
    showNotification(
      'Could not copy decklist. Check clipboard permissions.',
      'error'
    );
  }
};

const handleLoadMore = async () => {
  await loadMore();
};

onUnmounted(() => {
  if (searchTimeout) clearTimeout(searchTimeout);
  if (notificationTimeout) clearTimeout(notificationTimeout);
});

// Custom format dropdown.
const formatDropdownOpen = ref(false);

const selectedFormatLabel = computed(() => {
  return FORMAT_OPTIONS.find(
    (format) => format.value === currentFormat.value
  )?.label ?? 'Standard';
});

const selectFormat = (format: DeckFormat) => {
  if (!activeDeck.value) return;

  activeDeck.value.format = format;
  formatDropdownOpen.value = false;
};


const showImportDialog = ref(false);
const importText = ref('');
const isImporting = ref(false);
const importError = ref('');

const importPreview = ref<{
  entries: { card: MtgCard; quantity: number }[];
  commanderNames: string[];
  companionName: string | null;
  notFound: string[];
} | null>(null);

const handleResolveDecklist = async () => {
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
  } catch (err) {
    importError.value =
      err instanceof Error
        ? err.message
        : 'Could not resolve this decklist.';
  } finally {
    isImporting.value = false;
  }
};

const handleConfirmImport = () => {
  if (!importPreview.value || !activeDeck.value) return;

  replaceActiveDeckEntries(
    importPreview.value.entries,
    importPreview.value.commanderNames,
    importPreview.value.companionName
  );

  showImportDialog.value = false;
  importText.value = '';
  importPreview.value = null;
  importError.value = '';

  showNotification('Decklist imported successfully!');
};

const handleCancelImport = () => {
  showImportDialog.value = false;
  importPreview.value = null;
  importError.value = '';
};

</script>

<template>
  <div class="screen builder-screen">
    <!-- Toast -->
    <div
      v-if="notification.message"
      class="toast-notification"
      :class="notification.type"
      role="status"
      aria-live="polite"
    >
      <span class="toast-icon">
        {{ notification.type === 'success' ? '✓' : '!' }}
      </span>
      {{ notification.message }}
    </div>

    <!-- Header -->
    <header class="builder-header">
      <button @click="closeDeck" class="secondary-btn">
        ← Back to Decks
      </button>

      <input
        v-if="activeDeck"
        v-model="activeDeck.name"
        type="text"
        placeholder="Deck Name"
        class="deck-name-input"
      />

      <div class="deck-stats">
        <span class="count">
          {{ totalCardCount }} cards
        </span>

        <span
          :class="[
            'badge',
            deckIsLegal ? 'valid' : 'invalid'
          ]"
        >
          {{ deckIsLegal ? 'Format Legal' : 'Format Issues' }}
        </span>
      </div>

      <div class="builder-actions">
        <button @click="handleShare" class="secondary-btn">
          Share Decklist
        </button>

        <button
        type="button"
        class="secondary-btn"
        @click="showImportDialog = true"
        >
        Import Decklist
        </button>

        <button @click="handleSave" class="primary-btn">
          Save Deck
        </button>
      </div>
    </header>

    <div class="builder-workspace">
      <!-- Card Browser -->
      <div class="pane card-browser">
        <div class="filter-bar">
          <input
            v-model="filters.query"
            type="text"
            placeholder="Search any MTG card..."
          />

          <select v-model="filters.color">
            <option value="">All Colors</option>
            <option value="C">Colorless</option>
            <option value="W">White</option>
            <option value="U">Blue</option>
            <option value="B">Black</option>
            <option value="R">Red</option>
            <option value="G">Green</option>
            <option value="WU">Azorius</option>
            <option value="UB">Dimir</option>
            <option value="BR">Rakdos</option>
            <option value="RG">Gruul</option>
            <option value="GW">Selesnya</option>
            <option value="WB">Orzhov</option>
            <option value="UR">Izzet</option>
            <option value="BG">Golgari</option>
            <option value="RW">Boros</option>
            <option value="GU">Simic</option>
            <option value="WUB">Esper</option>
            <option value="UBR">Grixis</option>
            <option value="BRG">Jund</option>
            <option value="RGW">Naya</option>
            <option value="GWU">Bant</option>
            <option value="WBG">Abzan</option>
            <option value="URW">Jeskai</option>
            <option value="BGR">Sultai</option>
            <option value="RWB">Mardu</option>
            <option value="GUW">Temur</option>
            <option value="WUBR">Four Color</option>
            <option value="WUBRG">Five Color</option>
          </select>

          <select v-model="filters.type">
            <option value="">All Types</option>
            <option value="Creature">Creature</option>
            <option value="Instant">Instant</option>
            <option value="Sorcery">Sorcery</option>
            <option value="Artifact">Artifact</option>
            <option value="Enchantment">Enchantment</option>
            <option value="Planeswalker">Planeswalker</option>
            <option value="Land">Land</option>
          </select>

          <div class="mana-cost-filter">
            <label>
              Min MV
              <input
                v-model.number="filters.minCost"
                type="number"
                min="0"
                step="1"
              />
            </label>

            <label>
              Max MV
              <input
                v-model.number="filters.maxCost"
                type="number"
                min="0"
                step="1"
                placeholder="Any"
              />
            </label>
          </div>

          <button
            type="button"
            class="secondary-btn clear-filters-btn"
            @click="clearFilters"
          >
            Clear Filters
          </button>
        </div>

        <!-- Search grid column control -->
        <div class="grid-column-control search-column-control">
          <label for="search-columns">Search cards per row</label>

          <div class="grid-column-input">
            <button
              type="button"
              aria-label="Decrease search cards per row"
              :disabled="searchColumns <= MIN_COLUMNS"
              @click="changeSearchColumns(-1)"
            >
              −
            </button>

            <input
              id="search-columns"
              v-model.number="searchColumns"
              type="number"
              :min="MIN_COLUMNS"
              :max="MAX_COLUMNS"
              step="1"
              @change="validateSearchColumns"
            />

            <button
              type="button"
              aria-label="Increase search cards per row"
              :disabled="searchColumns >= MAX_COLUMNS"
              @click="changeSearchColumns(1)"
            >
              +
            </button>
          </div>
        </div>

        <div
          v-if="!collectionOnly && isLoading"
          class="loading-state"
        >
          Loading cards from Scryfall...
        </div>

        <div
          v-else-if="!collectionOnly && error && cards.length === 0"
          class="error-state"
        >
          {{ error }}
        </div>

        <div
          v-else-if="displayedCards.length === 0"
          class="loading-state"
        >
          {{
            collectionOnly
              ? 'No available cards in your collection match these filters.'
              : 'No cards found. Check your spelling or clear your filters.'
          }}
        </div>

        <div v-else class="catalog-results">
          <div
            class="catalog-grid"
            :style="{
              gridTemplateColumns: `repeat(${searchColumns}, minmax(0, 1fr))`
            }"
          >
            <div
              v-for="card in displayedCards"
              :key="card.id"
              class="card-item"
              :class="{
                'format-illegal':
                  getFormatLegality(card) === 'banned' ||
                  getFormatLegality(card) === 'not_legal'
              }"
            >
              <img
                :src="card.image"
                :alt="card.name"
                loading="lazy"
              />

              <div class="card-footer">
                <span class="card-title" :title="card.name">
                  {{ card.name }}
                </span>

                <span class="inventory-count">
                  {{ getCardInventoryText(card) }}
                </span>

                <span
                  v-if="getFormatWarning(card)"
                  class="format-card-warning"
                >
                  {{ getFormatWarning(card) }}
                </span>

                <span
                  v-else-if="getFormatLegality(card) === 'unknown'"
                  class="format-unknown"
                >
                  Legality not loaded
                </span>

                <button
                  class="primary-btn add-btn"
                  @click="handleAdd(card)"
                  :disabled="
                    collectionOnly &&
                    !canAddCardFromCollection(
                      card,
                      getDeckCopyLimit(card)
                    )
                  "
                >
                  {{
                    collectionOnly &&
                    !canAddCardFromCollection(
                      card,
                      getDeckCopyLimit(card)
                    )
                      ? 'Unavailable'
                      : '+ Add'
                  }}
                </button>
              </div>
            </div>
          </div>

          <p
            v-if="!collectionOnly && error"
            class="error-state"
          >
            {{ error }}
          </p>

          <button
            v-if="!collectionOnly && hasMore"
            class="secondary-btn load-more-btn"
            @click="handleLoadMore"
            :disabled="isLoadingMore"
          >
            {{ isLoadingMore ? 'Loading cards...' : 'Load More Cards' }}
          </button>

          <p
            v-if="!collectionOnly && !hasMore"
            class="catalog-end"
          >
            All matching cards have been loaded.
          </p>
        </div>
      </div>

      <!-- Deck Workspace -->
      <div class="pane deck-workspace">
        <!-- Deck heading and format dropdown -->
        
        <!-- Compact deck controls -->
        <div class="deck-workspace-header">
          <div class="deck-header-controls">
            <div class="format-settings">
              <label for="deck-format">Format</label>

              <div
                v-if="activeDeck"
                class="format-dropdown"
                :class="{
                  'format-dropdown--open': formatDropdownOpen
                }"
              >
                <button
                  id="deck-format"
                  type="button"
                  class="format-dropdown__trigger"
                  :class="{
                    'format-dropdown__trigger--featured':
                      FORMAT_OPTIONS.some(
                        (format) =>
                          format.value === currentFormat &&
                          format.featured
                      )
                  }"
                  :aria-expanded="formatDropdownOpen"
                  aria-haspopup="listbox"
                  @click="formatDropdownOpen = !formatDropdownOpen"
                >
                  <span>{{ selectedFormatLabel }}</span>
                  <span class="format-dropdown__chevron">▾</span>
                </button>

                <div
                  v-if="formatDropdownOpen"
                  class="format-dropdown__menu"
                  role="listbox"
                  aria-label="Choose deck format"
                >
                  <button
                    v-for="format in FORMAT_OPTIONS"
                    :key="format.value"
                    type="button"
                    role="option"
                    :aria-selected="currentFormat === format.value"
                    class="format-dropdown__option"
                    :class="{
                      'format-dropdown__option--featured': format.featured,
                      'format-dropdown__option--active':
                        currentFormat === format.value
                    }"
                    @click="selectFormat(format.value)"
                  >
                    <span class="format-dropdown__option-name">
                      <span
                        v-if="format.featured"
                        class="format-dropdown__star"
                      >
                        ✦
                      </span>
                      {{ format.label }}
                    </span>

                    <span
                      v-if="format.popular"
                      class="format-dropdown__popular"
                    >
                      POPULAR
                    </span>

                    <span
                      v-if="currentFormat === format.value"
                      class="format-dropdown__check"
                    >
                      ✓
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div class="collection-mode-bar">
              <label>
                <input
                  v-model="collectionOnly"
                  type="checkbox"
                />
                Use collection for deck
              </label>
            </div>

            <div class="grid-column-control deck-column-control">
              <label for="deck-columns">Cards per row</label>

              <div class="grid-column-input">
                <button
                  type="button"
                  aria-label="Decrease deck cards per row"
                  :disabled="deckColumns <= MIN_COLUMNS"
                  @click="changeDeckColumns(-1)"
                >
                  −
                </button>

                <input
                  id="deck-columns"
                  v-model.number="deckColumns"
                  type="number"
                  :min="MIN_COLUMNS"
                  :max="MAX_COLUMNS"
                  step="1"
                  @change="validateDeckColumns"
                />

                <button
                  type="button"
                  aria-label="Increase deck cards per row"
                  :disabled="deckColumns >= MAX_COLUMNS"
                  @click="changeDeckColumns(1)"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

               <!-- Commander and Companion Selection -->
        <div class="commander-companion-row">
          <!-- Commander Selection -->
          <div
            v-if="isCommanderFormat(currentFormat)"
            class="commander-settings"
          >
            <div class="commander-settings-header">
              <div>
                <strong>Commander Selection</strong>
                <span class="commander-summary">
                  {{
                    selectedCommanders.length
                      ? selectedCommanders.map((card) => card.name).join(' + ')
                      : 'No commander selected'
                  }}
                </span>
              </div>

              <button
                type="button"
                class="commander-toggle"
                :aria-expanded="showCommanderSettings"
                @click="showCommanderSettings = !showCommanderSettings"
              >
                {{ showCommanderSettings ? 'Collapse ▲' : 'Edit ▼' }}
              </button>
            </div>

            <div v-if="showCommanderSettings" class="commander-settings-body">
              <label for="commander-select">
                Primary commander
              </label>

              <select
                id="commander-select"
                v-model="selectedCommanderId"
              >
                <option value="">-- Select a commander --</option>

                <option
                  v-for="card in commanderCandidates"
                  :key="card.id"
                  :value="card.id"
                >
                  {{ card.name }}
                </option>
              </select>

              <p
                v-if="commanderCandidates.length === 0"
                class="commander-help"
              >
                Add an eligible legendary creature to your deck first.
              </p>

              <div
                v-if="selectedCommanderId && compatibleSecondCommanders.length > 0"
                class="second-commander-selection"
              >
                <label for="second-commander-select">
                  Second commander
                </label>

                <select
                  id="second-commander-select"
                  v-model="secondCommanderId"
                >
                  <option value="">-- No second commander --</option>

                  <option
                    v-for="card in compatibleSecondCommanders"
                    :key="card.id"
                    :value="card.id"
                  >
                    {{ card.name }}
                  </option>
                </select>

                <p
                  v-if="selectedCommander && secondCommanderId"
                  class="commander-help"
                >
                  Pairing mechanic:
                  {{ getPairingMechanic(
                    selectedCommander,
                    selectedCommanders[1]
                  ) }}
                </p>
              </div>
            </div>
          </div>

          <!-- Companion Selection -->
          <div
            v-if="companionCandidates.length > 0 || selectedCompanion"
            class="commander-settings companion-settings"
          >
            <div class="commander-settings-header">
              <div>
                <strong>Companion Selection</strong>

                <span class="commander-summary">
                  {{ selectedCompanion?.name ?? 'No companion selected' }}
                </span>
              </div>

              <button
                type="button"
                class="commander-toggle"
                :aria-expanded="showCompanionSettings"
                @click.stop="showCompanionSettings = !showCompanionSettings"
              >
                {{ showCompanionSettings ? 'Collapse ▲' : 'Edit ▼' }}
              </button>
            </div>

            <div
              v-show="showCompanionSettings"
              class="commander-settings-body"
            >
              <label for="companion-select">
                Companion
              </label>

              <select
                id="companion-select"
                v-model="selectedCompanionId"
              >
                <option value="">-- No companion --</option>

                <option
                  v-for="card in companionCandidates"
                  :key="card.id"
                  :value="card.id"
                >
                  {{ card.name }}
                </option>
              </select>

              <p class="commander-help">
                {{
                  selectedCompanion
                    ? `${selectedCompanion.name} is selected as your companion.`
                    : 'Select a companion card already included in your deck.'
                }}
              </p>
            </div>
          </div>
        </div>

        <!-- Collapsible Format Validation -->
        <div
          v-if="deckIssues.length > 0"
          class="deck-validation validation-invalid"
        >
          <div class="deck-validation-header">
            <strong>
              {{ deckIssues.length }} format
              {{ deckIssues.length === 1 ? 'issue' : 'issues' }}
            </strong>

            <button
              type="button"
              class="deck-validation-toggle"
              :aria-expanded="showDeckIssues"
              @click="showDeckIssues = !showDeckIssues"
            >
              {{ showDeckIssues ? 'Hide issues ▲' : 'Show issues ▼' }}
            </button>
          </div>

          <ul v-if="showDeckIssues">
            <li
              v-for="(issue, index) in deckIssues"
              :key="index"
            >
              {{ issue }}
            </li>
          </ul>
        </div>

        <div
          class="deck-grid-view"
          :style="{
            gridTemplateColumns: `repeat(${deckColumns}, minmax(0, 1fr))`
          }"
        >
          <div
            v-if="!activeDeck || activeDeck.entries.length === 0"
            class="empty-deck"
          >
            Your deck is empty. Add cards from the left panel!
          </div>

          <div
            v-for="entry in activeDeck?.entries"
            :key="entry.card.id"
            class="deck-grid-item"
            :class="{
              'collection-shortage':
                collectionOnly && getDeckEntryShortage(entry) > 0,
              'format-illegal':
                getDeckEntryWarnings(entry).length > 0
            }"
          >
            <img
              :src="entry.card.image"
              :alt="entry.card.name"
            />

            <!-- Both warnings share one vertical stack. -->
            <div
              v-if="
                getDeckEntryWarnings(entry).length > 0 ||
                (collectionOnly && getDeckEntryShortage(entry) > 0)
              "
              class="deck-card-warnings"
            >
              <div
                v-if="getDeckEntryWarnings(entry).length > 0"
                class="deck-format-warning"
                :class="{
                  'deck-format-warning--compact': deckColumns >= 5
                }"
                :title="getDeckEntryWarnings(entry).join('\n')"
              >
                <span class="format-warning-icon">!</span>

                <span
                  v-if="deckColumns < 5"
                  class="format-warning-label"
                >
                  {{ getDeckEntryWarnings(entry)[0] }}
                </span>
              </div>

              <div
                v-if="collectionOnly && getDeckEntryShortage(entry) > 0"
                class="collection-shortage-warning"
                :title="`You need ${getDeckEntryShortage(entry)} more ${entry.card.name} in your collection.`"
              >
                <span class="shortage-exclamation">!</span>

                <span
                  v-if="deckColumns < 5"
                  class="shortage-number"
                >
                  {{ getDeckEntryShortage(entry) }} SHORT IN COLLECTION
                </span>
              </div>
            </div>

            <div class="deck-item-controls">
              <div class="qty-buttons">
                <button
                  type="button"
                  @click="removeCard(entry.card.id)"
                  aria-label="Remove one copy"
                >
                  −
                </button>

                <input
                  class="deck-quantity-input"
                  type="number"
                  min="0"
                  step="1"
                  :value="entry.quantity"
                  :aria-label="`Quantity of ${entry.card.name}`"
                  @change="handleQuantityChange(entry, $event)"
                />

                <button
                  type="button"
                  @click="handleAdd(entry.card)"
                  :disabled="
                    collectionOnly &&
                    !canAddCardFromCollection(
                      entry.card,
                      getDeckCopyLimit(entry.card)
                    )
                  "
                  aria-label="Add one copy"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Import Decklist Dialog -->
<div
  v-if="showImportDialog"
  class="import-dialog-backdrop"
  @click.self="handleCancelImport"
>
  <div class="import-dialog">
    <div class="import-dialog-header">
      <h2>Import Decklist</h2>

      <button
        type="button"
        class="secondary-btn"
        @click="handleCancelImport"
      >
        ✕
      </button>
    </div>

    <p>
      Paste a decklist below. Card names and quantities will be resolved
      through Scryfall.
    </p>

    <textarea
      v-model="importText"
      class="import-decklist-input"
      placeholder="4 Lightning Bolt&#10;4 Mountain&#10;1 Sol Ring&#10;Commander: Atraxa, Praetors' Voice"
      rows="12"
      :disabled="isImporting"
    ></textarea>

    <p v-if="importError" class="import-error">
      {{ importError }}
    </p>

    <button
      v-if="!importPreview"
      type="button"
      class="primary-btn"
      :disabled="isImporting || !importText.trim()"
      @click="handleResolveDecklist"
    >
      {{ isImporting ? 'Resolving cards...' : 'Resolve Decklist' }}
    </button>

    <div v-if="importPreview" class="import-preview">
      <h3>Import Preview</h3>

      <p>
        {{ importPreview.entries.reduce((sum, entry) => sum + entry.quantity, 0) }}
        cards across {{ importPreview.entries.length }} unique cards.
      </p>

      <p v-if="importPreview.commanderNames.length">
        <strong>Commander:</strong>
        {{ importPreview.commanderNames.join(' + ') }}
      </p>

      <p v-if="importPreview.companionName">
        <strong>Companion:</strong>
        {{ importPreview.companionName }}
      </p>

      <div class="import-preview-list">
        <div
          v-for="entry in importPreview.entries"
          :key="entry.card.id"
          class="import-preview-entry"
        >
          <span>{{ entry.card.name }}</span>
          <strong>{{ entry.quantity }}x</strong>
        </div>
      </div>

      <div v-if="importPreview.notFound.length" class="import-not-found">
        <strong>
          {{ importPreview.notFound.length }} card names not found:
        </strong>

        <ul>
          <li v-for="name in importPreview.notFound" :key="name">
            {{ name }}
          </li>
        </ul>
      </div>

      <div class="import-dialog-actions">
        <button
          type="button"
          class="secondary-btn"
          @click="importPreview = null"
        >
          Edit List
        </button>

        <button
          type="button"
          class="primary-btn"
          @click="handleConfirmImport"
        >
          Replace Current Deck
        </button>
      </div>
    </div>
  </div>
</div>
  </div>
</template>

<style scoped src="../styles/deck-builder.css"></style>
