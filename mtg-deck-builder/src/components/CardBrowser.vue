<script setup lang="ts">
import { computed } from 'vue';
import { useDecks } from '../composables/UseDecks';
import { useCardCatalog } from '../composables/useCardCatalog';
import type { DeckFormat, MtgCard } from '../types/mtg';

const props = defineProps<{
  currentFormat: DeckFormat;
  collectionOnly: boolean;
  columns: number;
  minColumns: number;
  maxColumns: number;
}>();

const emit = defineEmits<{
  addCard: [card: MtgCard];
  changeColumns: [amount: number];
  updateColumns: [value: number];
  validateColumns: [];
}>();

const {
  activeDeck,
  getAvailableQuantityForActiveDeck,
  canAddCardFromCollection
} = useDecks();

const catalog = useCardCatalog({
  activeDeck,
  currentFormat: computed(() => props.currentFormat),
  collectionOnly: computed(() => props.collectionOnly),
  getAvailableQuantity: getAvailableQuantityForActiveDeck
});

const {
  cards,
  filters,
  displayedCards,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  getFormatLegality,
  getFormatWarning,
  getDeckCopyLimit,
  loadMore,
  clearFilters
} = catalog;

const getCardInventoryText = (card: MtgCard): string => {
  return `Available: ${getAvailableQuantityForActiveDeck(card.id)}`;
};
</script>

<template>
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

    <div class="grid-column-control search-column-control">
      <label for="search-columns">Search cards per row</label>

      <div class="grid-column-input">
        <button
          type="button"
          aria-label="Decrease search cards per row"
          :disabled="columns <= minColumns"
          @click="emit('changeColumns', -1)"
        >
          −
        </button>

        <input
          id="search-columns"
          :value="columns"
          type="number"
          :min="minColumns"
          :max="maxColumns"
          step="1"
          @input="emit('updateColumns', Number(($event.target as HTMLInputElement).value))"
          @change="emit('validateColumns')"
        />

        <button
          type="button"
          aria-label="Increase search cards per row"
          :disabled="columns >= maxColumns"
          @click="emit('changeColumns', 1)"
        >
          +
        </button>
      </div>
    </div>

    <div v-if="!collectionOnly && isLoading" class="loading-state">
      Loading cards from Scryfall...
    </div>

    <div
      v-else-if="!collectionOnly && error && cards.length === 0"
      class="error-state"
    >
      {{ error }}
    </div>

    <div v-else-if="displayedCards.length === 0" class="loading-state">
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
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
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
          <img :src="card.image" :alt="card.name" loading="lazy" />

          <div class="card-footer">
            <span class="card-title" :title="card.name">
              {{ card.name }}
            </span>

            <span class="inventory-count">
              {{ getCardInventoryText(card) }}
            </span>

            <span v-if="getFormatWarning(card)" class="format-card-warning">
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
              :disabled="
                collectionOnly &&
                !canAddCardFromCollection(card, getDeckCopyLimit(card))
              "
              @click="emit('addCard', card)"
            >
              {{
                collectionOnly &&
                !canAddCardFromCollection(card, getDeckCopyLimit(card))
                  ? 'Unavailable'
                  : '+ Add'
              }}
            </button>
          </div>
        </div>
      </div>

      <p v-if="!collectionOnly && error" class="error-state">
        {{ error }}
      </p>

      <button
        v-if="!collectionOnly && hasMore"
        class="secondary-btn load-more-btn"
        :disabled="isLoadingMore"
        @click="loadMore"
      >
        {{ isLoadingMore ? 'Loading cards...' : 'Load More Cards' }}
      </button>

      <p v-if="!collectionOnly && !hasMore" class="catalog-end">
        All matching cards have been loaded.
      </p>
    </div>
  </div>
</template>

<style scoped src="../styles/card-browser.css"></style>
