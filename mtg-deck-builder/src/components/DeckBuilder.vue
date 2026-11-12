
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useDecks } from '../composables/UseDecks';
import { useScryfallAPI } from '../services/Scryfall';
import type { CardFilters, MtgCard } from '../types/mtg';

const {
  activeDeck,
  totalCardCount,
  isDeckValid,
  closeDeck,
  addCard,
  removeCard,
  saveActiveDeck,
  getShareableDecklist
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

// Notification state
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

// Clear all search filters
const clearFilters = () => {
  filters.value = {
    query: '',
    color: '',
    type: '',
    minCost: 0,
    maxCost: null
  };
};

// Search debounce
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  await searchCards(filters.value);
});

// Search whenever filters change
watch(
  filters,
  (newFilters) => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    searchTimeout = setTimeout(() => {
      searchCards({ ...newFilters });
    }, 350);
  },
  { deep: true }
);

// Add card to deck
const handleAdd = (card: MtgCard) => {
  const result = addCard(card);

  if (!result.success && result.message) {
    showNotification(result.message, 'error');
  }
};

// Save deck without leaving the builder
const handleSave = () => {
  saveActiveDeck();
  showNotification('Deck saved successfully!');
};

// Copy decklist
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

// Load next page of cards
const handleLoadMore = async () => {
  await loadMore();
};

// Clean up timers
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

        <!-- Search Filters -->
        <div class="filter-bar">

          <input
            type="text"
            v-model="filters.query"
            placeholder="Search any MTG card (e.g. Mikaeus, Sol Ring)..."
          />

          <!-- Color Filter -->
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
              <option value="BGR">Sultai (Black/Green/Blue)</option>
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

          <!-- Card Type Filter -->
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

          <!-- Mana Value Filters -->
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

          <!-- Clear Filters Button -->
          <button
            type="button"
            class="secondary-btn clear-filters-btn"
            @click="clearFilters"
          >
            Clear Filters
          </button>

        </div>

        <!-- Initial Loading -->
        <div v-if="isLoading" class="loading-state">
          Loading cards from Scryfall...
        </div>

        <!-- Initial Search Error -->
        <div
          v-else-if="error && cards.length === 0"
          class="error-state"
        >
          {{ error }}
        </div>

        <!-- Empty Results -->
        <div
          v-else-if="cards.length === 0"
          class="loading-state"
        >
          No cards found. Check your spelling or clear your filters.
        </div>

        <!-- Card Results -->
        <div v-else class="catalog-results">

          <div class="catalog-grid">
            <div
              v-for="card in cards"
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

                <button
                  @click="handleAdd(card)"
                  class="primary-btn add-btn"
                >
                  + Add
                </button>
              </div>
            </div>
          </div>

          <!-- Pagination Error -->
          <p v-if="error" class="error-state">
            {{ error }}
          </p>

          <!-- Load More -->
          <button
            v-if="hasMore"
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

          <!-- End of Results -->
          <p v-else class="catalog-end">
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
          >
            <img
              :src="entry.card.image"
              :alt="entry.card.name"
            />

            <div class="deck-item-controls">
              <span>
                {{ entry.quantity }}x
              </span>

              <div class="qty-buttons">
                <button @click="removeCard(entry.card.id)">
                  -
                </button>

                <button @click="handleAdd(entry.card)">
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
