
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useScryfallAPI } from '../services/Scryfall';
import { useDecks } from '../composables/UseDecks';
import { StorageService } from '../services/Storage';
import type { CardFilters, MtgCard, CollectionEntry } from '../types/mtg';

const emit = defineEmits<{
  back: [];
}>();

const { loadSavedDecks, getAllocatedQuantity } = useDecks();

const {
  cards,
  searchCards,
  loadMore,
  hasMore,
  isLoading,
  isLoadingMore,
  error
} = useScryfallAPI();

const collection = ref<CollectionEntry[]>([]);
const searchQuery = ref('');
const notice = ref('');
const noticeIsError = ref(false);

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const showNotice = (message: string, isError = false) => {
  notice.value = message;
  noticeIsError.value = isError;
};

const loadCollection = () => {
  collection.value = StorageService.getCollection();
};

onMounted(() => {
  loadCollection();
  loadSavedDecks();
});

const search = async () => {
  const query = searchQuery.value.trim();

  if (!query) return;

  const filters: CardFilters = {
    query,
    color: '',
    type: '',
    minCost: 0,
    maxCost: null
  };

  await searchCards(filters);
};

watch(searchQuery, () => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (!searchQuery.value.trim()) return;

  searchTimeout = setTimeout(() => {
    search();
  }, 400);
});

const getOwnedQuantity = (cardId: string): number => {
  return collection.value.find(
    (entry) => entry.card.id === cardId
  )?.quantity ?? 0;
};

const allocatedFor = (cardId: string): number => {
  return getAllocatedQuantity(cardId);
};

const availableFor = (cardId: string): number => {
  return Math.max(
    0,
    getOwnedQuantity(cardId) - allocatedFor(cardId)
  );
};

/**
 * Set the exact number of copies owned.
 * The quantity cannot be reduced below the number
 * already allocated to saved decks.
 */
const setQuantity = (card: MtgCard, quantity: number) => {
  const safeQuantity = Math.max(
    0,
    Math.floor(Number(quantity) || 0)
  );

  const allocated = allocatedFor(card.id);

  if (safeQuantity < allocated) {
    showNotice(
      `Cannot set ${card.name} to ${safeQuantity}. ${allocated} copies are allocated to saved decks.`,
      true
    );
    loadCollection();
    return;
  }

  try {
    StorageService.setCollectionQuantity(card, safeQuantity);
    loadCollection();
    notice.value = '';
  } catch {
    showNotice('Could not update your collection. Please try again.', true);
    loadCollection();
  }
};

const setQuantityFromInput = (card: MtgCard, event: Event) => {
  const target = event.target as HTMLInputElement;
  const value = target.value.trim();

  const quantity = value === '' ? 0 : Number(value);

  if (!Number.isFinite(quantity) || quantity < 0) {
    showNotice('Please enter a valid quantity.', true);
    loadCollection();
    return;
  }

  setQuantity(card, quantity);
};

const changeQuantity = (card: MtgCard, change: number) => {
  const currentQuantity = getOwnedQuantity(card.id);
  setQuantity(card, currentQuantity + change);
};

/**
 * Remove every copy of a card in one action.
 * This is blocked if any copies are allocated to decks.
 */
const removeAllCopies = (card: MtgCard) => {
  const allocated = allocatedFor(card.id);

  if (allocated > 0) {
    showNotice(
      `Cannot remove ${card.name}: ${allocated} ${allocated === 1 ? 'copy is' : 'copies are'} allocated to saved decks. Remove those cards from the decks first.`,
      true
    );
    return;
  }

  try {
    StorageService.removeFromCollection(card.id);
    loadCollection();
    notice.value = '';
  } catch {
    showNotice('Could not remove this card. Please try again.', true);
  }
};

const handleLoadMore = async () => {
  await loadMore();
};

onUnmounted(() => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
});
</script>

<template>
  <div class="screen collection-screen">
    <header class="collection-header">
      <div>
        <h1>My Collection</h1>
        <p>Manage the physical Magic cards you own.</p>
      </div>

      <button class="secondary-btn" @click="emit('back')">
        ← Back to Decks
      </button>
    </header>

    <p
      v-if="notice"
      class="collection-message"
      :class="{ 'error-state': noticeIsError }"
      role="status"
    >
      {{ notice }}
    </p>

    <section class="collection-search">
      <h2>Add cards to your collection</h2>

      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search for a card, e.g. Sol Ring..."
      />

      <p class="collection-help">
        Search for a card, then use the quantity field or plus and minus
        buttons to set how many physical copies you own.
      </p>
    </section>

    <section v-if="searchQuery.trim()" class="collection-search-results">
      <h2>Search Results</h2>

      <div v-if="isLoading" class="collection-message">
        Searching Scryfall...
      </div>

      <div
        v-else-if="error && cards.length === 0"
        class="collection-message error-state"
      >
        {{ error }}
      </div>

      <div v-else-if="cards.length === 0" class="collection-message">
        No cards found. Try another search.
      </div>

      <div v-else class="collection-card-grid">
        <article
          v-for="card in cards"
          :key="card.id"
          class="collection-card"
        >
          <img :src="card.image" :alt="card.name" loading="lazy" />

          <div class="collection-card-info">
            <h3 :title="card.name">{{ card.name }}</h3>

            <p>
              Owned: <strong>{{ getOwnedQuantity(card.id) }}</strong>
            </p>

            <div class="collection-quantity-controls">
              <button
                type="button"
                :disabled="getOwnedQuantity(card.id) <= allocatedFor(card.id)"
                @click="changeQuantity(card, -1)"
                aria-label="Remove one copy"
              >
                −
              </button>

              <input
                class="collection-quantity-input"
                type="number"
                min="0"
                step="1"
                :value="getOwnedQuantity(card.id)"
                @change="setQuantityFromInput(card, $event)"
                :aria-label="`Quantity owned of ${card.name}`"
              />

              <button
                type="button"
                @click="changeQuantity(card, 1)"
                aria-label="Add one copy"
              >
                +
              </button>
            </div>

            <button
              v-if="getOwnedQuantity(card.id) > 0"
              type="button"
              class="danger-btn"
              @click="removeAllCopies(card)"
            >
              Remove all
            </button>
          </div>
        </article>
      </div>

      <p v-if="error && cards.length > 0" class="error-state">
        {{ error }}
      </p>

      <button
        v-if="hasMore"
        class="secondary-btn collection-load-more"
        :disabled="isLoadingMore"
        @click="handleLoadMore"
      >
        {{ isLoadingMore ? 'Loading...' : 'Load More Cards' }}
      </button>
    </section>

    <section class="owned-collection">
      <div class="owned-collection-heading">
        <div>
          <h2>Cards I Own</h2>
          <p>{{ collection.length }} unique cards in your collection</p>
        </div>
      </div>

      <div v-if="collection.length === 0" class="collection-empty">
        <div class="collection-empty-icon">✦</div>
        <h3>Your collection is empty</h3>
        <p>
          Search for cards above and add the copies you own.
        </p>
      </div>

      <div v-else class="owned-card-list">
        <article
          v-for="entry in collection"
          :key="entry.card.id"
          class="owned-card-row"
        >
          <img
            :src="entry.card.image"
            :alt="entry.card.name"
            loading="lazy"
          />

          <div class="owned-card-info">
            <h3>{{ entry.card.name }}</h3>
            <p>{{ entry.card.type }}</p>
          </div>

          <div class="owned-card-stats">
            <span>Owned: {{ entry.quantity }}</span>
            <span>Allocated: {{ allocatedFor(entry.card.id) }}</span>
            <strong>Available: {{ availableFor(entry.card.id) }}</strong>
          </div>

          <div class="collection-quantity-controls">
            <button
              type="button"
              :disabled="entry.quantity <= allocatedFor(entry.card.id)"
              @click="changeQuantity(entry.card, -1)"
              aria-label="Remove one copy"
            >
              −
            </button>

            <input
              class="collection-quantity-input"
              type="number"
              min="0"
              step="1"
              :value="entry.quantity"
              @change="setQuantityFromInput(entry.card, $event)"
              :aria-label="`Quantity owned of ${entry.card.name}`"
            />

            <button
              type="button"
              @click="changeQuantity(entry.card, 1)"
              aria-label="Add one copy"
            >
              +
            </button>
          </div>

          <button
            type="button"
            class="danger-btn"
            @click="removeAllCopies(entry.card)"
          >
            Remove all
          </button>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped src="../styles/collection.css"></style>
