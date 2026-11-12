
<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import { useDecks } from '../composables/UseDecks';
import { useScryfallAPI } from '../services/Scryfall';
import { StorageService } from '../services/Storage';
import type {
  CardFilters,
  MtgCard,
  CollectionEntry,
  DeckEntry,
  DeckFormat
} from '../types/mtg';

const {
  activeDeck,
  totalCardCount,
  closeDeck,
  addCard,
  removeCard,
  saveActiveDeck,
  getShareableDecklist,
  getAvailableQuantityForActiveDeck,
  canAddCardFromCollection
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

// Collection-only mode belongs to the active deck.
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

// Refresh legality information for saved collection cards.
// Scryfall accepts up to 75 card identifiers per request.
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

    // Also refresh cards already present in the active deck.
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
  if (currentFormat.value === 'any') {
    return 'legal';
  }

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
  if (
    currentFormat.value === 'any' ||
    isBasicLand(card) ||
    canHaveAnyNumber(card)
  ) {
    return 999;
  }

  return currentFormat.value === 'commander' ? 1 : 4;
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
//
// Important: Scryfall's keywords are stored in MtgCard.tags in this project.

const isBackground = (card: MtgCard): boolean => {
  return /legendary enchantment.*background/i.test(card.type);
};

const hasKeyword = (card: MtgCard, keyword: string): boolean => {
  return (card.tags ?? []).some(
    (item) => item.toLowerCase() === keyword.toLowerCase()
  );
};

const isCommanderEligible = (card: MtgCard): boolean => {
  const type = card.type.toLowerCase();
  const oracle = (card.oracleText ?? '').toLowerCase();

  if (isBackground(card)) return false;

  if (oracle.includes('can be your commander')) {
    return true;
  }

  return (
    type.includes('legendary') &&
    type.includes('creature')
  );
};

const isValidSecondCommanderCard = (card: MtgCard): boolean => {
  return isCommanderEligible(card) || isBackground(card);
};

const hasPartnerWith = (card: MtgCard, other: MtgCard): boolean => {
  const oracle = card.oracleText ?? '';
  const match = oracle.match(/partner with ([^(.\n]+)/i);

  return Boolean(
    match &&
    match[1].trim().toLowerCase() === other.name.toLowerCase()
  );
};

const canPairCommanders = (
  first: MtgCard,
  second: MtgCard
): boolean => {
  if (first.id === second.id) return false;

  // Partner.
  if (
    hasKeyword(first, 'Partner') &&
    hasKeyword(second, 'Partner')
  ) {
    return true;
  }

  // Friends forever.
  if (
    hasKeyword(first, 'Friends forever') &&
    hasKeyword(second, 'Friends forever')
  ) {
    return true;
  }

  // Partner with a named card.
  if (
    hasPartnerWith(first, second) ||
    hasPartnerWith(second, first)
  ) {
    return true;
  }

  // Choose a Background.
  const firstChoosesBackground =
    hasKeyword(first, 'Choose a Background');

  const secondChoosesBackground =
    hasKeyword(second, 'Choose a Background');

  if (
    (firstChoosesBackground && isBackground(second)) ||
    (secondChoosesBackground && isBackground(first))
  ) {
    return true;
  }

  // Doctor's companion.
  const firstHasDoctorCompanion =
    hasKeyword(first, "Doctor's companion");

  const secondHasDoctorCompanion =
    hasKeyword(second, "Doctor's companion");

  const firstIsDoctor =
    /time lord.*doctor|doctor.*time lord/i.test(first.type);

  const secondIsDoctor =
    /time lord.*doctor|doctor.*time lord/i.test(second.type);

  if (
    (firstHasDoctorCompanion && secondIsDoctor) ||
    (secondHasDoctorCompanion && firstIsDoctor)
  ) {
    return true;
  }

  return false;
};

// Only cards already in the deck can be selected as commanders.
// This prevents selecting a commander that isn't actually in the decklist.
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

    // Keep the second commander only if the new first commander
    // can legally pair with it.
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
  if (!activeDeck.value || !selectedCommanderId.value) {
    return null;
  }

  return activeDeck.value.entries.find(
    (entry) => entry.card.id === selectedCommanderId.value
  )?.card ?? null;
});

// Only show the second selector if the first commander has a pairing
// mechanic and there is at least one compatible card in the deck.
const compatibleSecondCommanders = computed(() => {
  if (!activeDeck.value || !selectedCommander.value) {
    return [];
  }

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

  if (currentFormat.value !== 'any') {
    const legality = getFormatLegality(entry.card);
    const formatName = currentFormat.value.toUpperCase();

    if (legality === 'banned') {
      warnings.push(`BANNED IN ${formatName}`);
    } else if (legality === 'not_legal') {
      warnings.push(`NOT LEGAL IN ${formatName}`);
    }

    if (getCopyLimitShortage(entry) > 0) {
      warnings.push(
        `COPY LIMIT: ${getDeckCopyLimit(entry.card)} MAXIMUM`
      );
    }

    if (hasCommanderIdentityViolation(entry.card)) {
      warnings.push('COLOR IDENTITY VIOLATION');
    }
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

  if (query && !card.name.toLowerCase().includes(query)) {
    return false;
  }

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
    // Only enforce format legality in Standard and Commander.
    if (currentFormat.value !== 'any') {
      const legality = getFormatLegality(card);

      if (legality === 'banned' || legality === 'not_legal') {
        return false;
      }
    }

    if (collectionOnly.value) {
      const alreadyInDeck = activeDeck.value?.entries.some(
        (deckEntry) => deckEntry.card.id === card.id
      ) ?? false;

      const available = getAvailableQuantityForActiveDeck(card.id);

      if (available <= 0 && !alreadyInDeck) {
        return false;
      }
    }

    return matchesLocalFilters(card);
  });
});

// Overall deck validation.

const deckIssues = computed(() => {
  if (!activeDeck.value) return [];

  const issues: string[] = [];

  // Standard deck size.
  if (currentFormat.value === 'standard') {
    if (totalCardCount.value < 60) {
      issues.push(
        `Standard requires at least 60 cards. You currently have ${totalCardCount.value}.`
      );
    }
  }

  // Commander deck size and commander selection.
  if (currentFormat.value === 'commander') {
    if (totalCardCount.value !== 100) {
      issues.push(
        `Commander requires exactly 100 cards, including your commander. You currently have ${totalCardCount.value}.`
      );
    }

    const ids = activeDeck.value.commanderIds ?? [];

    if (ids.length === 0) {
      issues.push('Select a commander.');
    } else if (selectedCommanders.value.length !== ids.length) {
      issues.push('Your selected commander is not present in the deck.');
    } else if (!commanderPairValid.value) {
      issues.push(
        'Your commander selection is not a valid commander or permitted commander pair.'
      );
    }

    if (ids.length > 2) {
      issues.push('A Commander deck can have at most two commanders.');
    }
  }

  // Card-specific restrictions only apply to Standard and Commander.
  // Any mode allows all cards and has no copy limit.
  if (currentFormat.value !== 'any') {
    activeDeck.value.entries.forEach((entry) => {
      const legality = getFormatLegality(entry.card);

      if (legality === 'banned') {
        issues.push(
          `${entry.card.name} is banned in ${currentFormat.value}.`
        );
      } else if (legality === 'not_legal') {
        issues.push(
          `${entry.card.name} is not legal in ${currentFormat.value}.`
        );
      }

      const shortage = getCopyLimitShortage(entry);

      if (shortage > 0) {
        issues.push(
          `${entry.card.name} exceeds the copy limit by ${shortage}.`
        );
      }

      if (hasCommanderIdentityViolation(entry.card)) {
        issues.push(
          `${entry.card.name} is outside your commander's color identity.`
        );
      }
    });
  }

  return [...new Set(issues)];
});

const deckIsLegal = computed(() => deckIssues.value.length === 0);

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
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

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

        <button @click="handleSave" class="primary-btn">
          Save Deck
        </button>
      </div>
    </header>

    <div class="builder-workspace">

      <!-- Card Browser -->
      <div class="pane card-browser">

        <!-- Filters -->
        <div class="filter-bar">
          <input
            type="text"
            v-model="filters.query"
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
                type="number"
                v-model.number="filters.minCost"
                min="0"
                step="1"
              />
            </label>

            <label>
              Max MV
              <input
                type="number"
                v-model.number="filters.maxCost"
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

        <!-- Loading -->
        <div
          v-if="!collectionOnly && isLoading"
          class="loading-state"
        >
          Loading cards from Scryfall...
        </div>

        <!-- Error -->
        <div
          v-else-if="!collectionOnly && error && cards.length === 0"
          class="error-state"
        >
          {{ error }}
        </div>

        <!-- Empty -->
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

        <!-- Results -->
        <div v-else class="catalog-results">
          <div class="catalog-grid">
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
                  @click="handleAdd(card)"
                  class="primary-btn add-btn"
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
            @click="handleLoadMore"
            :disabled="isLoadingMore"
            class="secondary-btn load-more-btn"
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
        <h2>Current Deck</h2>

        <!-- Deck Settings -->
        <div class="deck-settings">
        <div class="format-settings">
            <label for="deck-format">
            Deck Format
            </label>

            <select
            id="deck-format"
            v-if="activeDeck"
            v-model="activeDeck.format"
            >
            <option value="standard">Standard</option>
            <option value="commander">Commander</option>
            <option value="any">Any</option>
            </select>
        </div>

        <div class="collection-mode-bar">
            <label>
            <input
                type="checkbox"
                v-model="collectionOnly"
            />
            Use collection only for this deck
            </label>

            <span v-if="collectionOnly">
            Only cards in your collection with available copies are shown.
            </span>
        </div>
        </div>

        <!-- Format Validation -->
        <div
          class="deck-validation"
          :class="deckIsLegal ? 'validation-valid' : 'validation-invalid'"
        >
          <strong>
            {{ deckIsLegal ? 'Deck passes current checks' : 'Deck has format issues' }}
          </strong>

          <ul v-if="deckIssues.length">
            <li v-for="issue in deckIssues" :key="issue">
              {{ issue }}
            </li>
          </ul>
        </div>

        <div class="deck-grid-view">
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

            <!-- Format Warnings -->
            <div
                v-if="getDeckEntryWarnings(entry).length > 0"
                class="deck-format-warning"
                :title="getDeckEntryWarnings(entry).join('\n')"
                >
                <span class="format-warning-icon">!</span>

                <span class="format-warning-label">
                    {{ getDeckEntryWarnings(entry)[0] }}
                </span>
            </div>

            <!-- Collection Shortage -->
            <div
              v-if="collectionOnly && getDeckEntryShortage(entry) > 0"
              class="collection-shortage-warning"
              :title="`You need ${getDeckEntryShortage(entry)} more ${entry.card.name}.`"
            >
              <span class="shortage-exclamation">!</span>
              <span class="shortage-number">
                −{{ getDeckEntryShortage(entry) }}
              </span>
            </div>

            <div class="deck-item-controls">
              <span>{{ entry.quantity }}x</span>

              <div class="qty-buttons">
                <button @click="removeCard(entry.card.id)">
                  -
                </button>

                <button
                  @click="handleAdd(entry.card)"
                  :disabled="
                    collectionOnly &&
                    !canAddCardFromCollection(
                      entry.card,
                      getDeckCopyLimit(entry.card)
                    )
                  "
                  :title="
                    collectionOnly &&
                    !canAddCardFromCollection(
                      entry.card,
                      getDeckCopyLimit(entry.card)
                    )
                      ? 'No more copies available in your collection'
                      : 'Add one copy'
                  "
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped src="../styles/deck-builder.css"></style>
