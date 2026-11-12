
<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import { useDecks } from '../composables/UseDecks';
import { useScryfallAPI } from '../services/Scryfall';
import { StorageService } from '../services/Storage';
import type { CardFilters, MtgCard, CollectionEntry, DeckEntry } from '../types/mtg';

const {
  activeDeck,
  totalCardCount,
  isDeckValid,
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

watch(collectionOnly, (enabled) => {
  if (enabled) {
    loadCollection();
  }
});

// Calculate how many copies an existing deck entry exceeds availability by.
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
  if (!collectionOnly.value) {
    return cards.value;
  }

  return collectionEntries.value
    .filter((entry) => {
      const card = entry.card;

      const alreadyInDeck = activeDeck.value?.entries.some(
        (deckEntry) => deckEntry.card.id === card.id
      ) ?? false;

      const available = getAvailableQuantityForActiveDeck(card.id);

      return (
        (available > 0 || alreadyInDeck) &&
        matchesLocalFilters(card)
      );
    })
    .map((entry) => entry.card);
});

// Notification state.
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

  if (!collectionOnly.value) {
    await searchCards(filters.value);
  }
});

watch(
  filters,
  (newFilters) => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (collectionOnly.value) {
      return;
    }

    searchTimeout = setTimeout(() => {
      searchCards({ ...newFilters });
    }, 350);
  },
  { deep: true }
);

const handleAdd = (card: MtgCard) => {
  const result = addCard(card, collectionOnly.value);

  if (!result.success && result.message) {
    showNotification(result.message, 'error');
  }
};

const getCardInventoryText = (card: MtgCard): string => {
  const available = getAvailableQuantityForActiveDeck(card.id);
  return `Available: ${available}`;
};

const handleSave = () => {
  saveActiveDeck();
  showNotification('Deck saved successfully!');
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
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }
});
</script>

<template>
  <div class="screen builder-screen">

    <!-- Toast Notification -->
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

    <!-- Header Controls -->
    <header class="builder-header">
      <button @click="closeDeck" class="secondary-btn">
        ← Back to Decks
      </button>

      <input
        v-if="activeDeck"
        type="text"
        v-model="activeDeck.name"
        placeholder="Deck Name"
        class="deck-name-input"
      />

      <div class="deck-stats">
        <span class="count">
          {{ totalCardCount }} cards
        </span>

        <span :class="['badge', isDeckValid ? 'valid' : 'invalid']">
          {{
            isDeckValid
              ? 'Valid Deck (60+)'
              : `Needs ${60 - totalCardCount} more cards`
          }}
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

    <!-- Split Workspace -->
    <div class="builder-workspace">

      <!-- Left: Card Catalog Browser -->
      <div class="pane card-browser">

        <!-- Collection-only Deck Setting -->
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

        <!-- Search Filters -->
        <div class="filter-bar">

          <input
            type="text"
            v-model="filters.query"
            placeholder="Search any MTG card (e.g. Protean Hulk, Sol Ring)..."
          />

          <select v-model="filters.color">
            <option value="">All Colors</option>

            <optgroup label="Colorless">
              <option value="C">Colorless</option>
            </optgroup>

            <optgroup label="One Color">
              <option value="W">White</option>
              <option value="U">Blue</option>
              <option value="B">Black</option>
              <option value="R">Red</option>
              <option value="G">Green</option>
            </optgroup>

            <optgroup label="Two Colors">
              <option value="WU">Azorius (White/Blue)</option>
              <option value="UB">Dimir (Blue/Black)</option>
              <option value="BR">Rakdos (Black/Red)</option>
              <option value="RG">Gruul (Red/Green)</option>
              <option value="GW">Selesnya (Green/White)</option>
              <option value="WB">Orzhov (White/Black)</option>
              <option value="UR">Izzet (Blue/Red)</option>
              <option value="BG">Golgari (Black/Green)</option>
              <option value="RW">Boros (Red/White)</option>
              <option value="GU">Simic (Green/Blue)</option>
            </optgroup>

            <optgroup label="Three Colors">
              <option value="WUB">Esper (White/Blue/Black)</option>
              <option value="UBR">Grixis (Blue/Black/Red)</option>
              <option value="BRG">Jund (Black/Red/Green)</option>
              <option value="RGW">Naya (Red/Green/White)</option>
              <option value="GWU">Bant (Green/White/Blue)</option>
              <option value="WBG">Abzan (White/Black/Green)</option>
              <option value="URW">Jeskai (Blue/Red/White)</option>
              <option value="BGR">Sultai (Blue/Black/Green)</option>
              <option value="RWB">Mardu (Red/White/Black)</option>
              <option value="GUW">Temur (Green/Blue/Red)</option>
            </optgroup>

            <optgroup label="Four Colors">
              <option value="WUBR">White/Blue/Black/Red</option>
              <option value="UBRG">Blue/Black/Red/Green</option>
              <option value="BRGW">Black/Red/Green/White</option>
              <option value="RGWU">Red/Green/White/Blue</option>
              <option value="GWUB">Green/White/Blue/Black</option>
            </optgroup>

            <optgroup label="Five Colors">
              <option value="WUBRG">Five-Color (WUBRG)</option>
            </optgroup>
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
                aria-label="Minimum mana value"
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
                aria-label="Maximum mana value"
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

        <!-- Initial Loading -->
        <div
          v-if="!collectionOnly && isLoading"
          class="loading-state"
        >
          Loading cards from Scryfall...
        </div>

        <!-- Initial Search Error -->
        <div
          v-else-if="!collectionOnly && error && cards.length === 0"
          class="error-state"
        >
          {{ error }}
        </div>

        <!-- Empty Results -->
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

        <!-- Card Results -->
        <div v-else class="catalog-results">

          <div class="catalog-grid">
            <div
              v-for="card in displayedCards"
              :key="card.id"
              class="card-item"
            >
              <img
                :src="card.image"
                :alt="card.name"
                loading="lazy"
              />

              <div class="card-footer">
                <span
                  class="card-title"
                  :title="card.name"
                >
                  {{ card.name }}
                </span>

                <span class="inventory-count">
                  {{ getCardInventoryText(card) }}
                </span>

                <button
                  @click="handleAdd(card)"
                  class="primary-btn add-btn"
                  :disabled="
                    collectionOnly &&
                    !canAddCardFromCollection(card)
                  "
                >
                  {{
                    collectionOnly &&
                    !canAddCardFromCollection(card)
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
            {{
              isLoadingMore
                ? 'Loading cards...'
                : 'Load More Cards'
            }}
          </button>

          <p
            v-if="!collectionOnly && !hasMore"
            class="catalog-end"
          >
            All matching cards have been loaded.
          </p>
        </div>
      </div>

      <!-- Right: Active Deck Workspace -->
      <div class="pane deck-workspace">
        <h2>Current Deck</h2>

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
                collectionOnly && getDeckEntryShortage(entry) > 0
            }"
          >
            <img
              :src="entry.card.image"
              :alt="entry.card.name"
            />

            <!-- Shortage Warning -->
            <div
              v-if="collectionOnly && getDeckEntryShortage(entry) > 0"
              class="collection-shortage-warning"
              role="status"
              :title="`You need ${getDeckEntryShortage(entry)} more ${entry.card.name} to cover this deck entry.`"
            >
              <span class="shortage-exclamation">!</span>
              <span class="shortage-number">
                −{{ getDeckEntryShortage(entry) }}
              </span>
            </div>

            <div class="deck-item-controls">
              <span>
                {{ entry.quantity }}x
              </span>

              <div class="qty-buttons">
                <button @click="removeCard(entry.card.id)">
                  -
                </button>

                <button
                  @click="handleAdd(entry.card)"
                  :disabled="
                    collectionOnly &&
                    !canAddCardFromCollection(entry.card)
                  "
                  :title="
                    collectionOnly &&
                    !canAddCardFromCollection(entry.card)
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
