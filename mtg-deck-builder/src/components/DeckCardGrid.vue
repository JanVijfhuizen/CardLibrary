<script setup lang="ts">
import type { DeckEntry, MtgCard } from '../types/mtg';

defineProps<{
  entries: DeckEntry[];
  columns: number;
  collectionOnly: boolean;
  getDeckEntryWarnings: (entry: DeckEntry) => string[];
  getDeckEntryShortage: (entry: DeckEntry) => number;
  getDeckCopyLimit: (card: MtgCard) => number;
  canAddCardFromCollection: (card: MtgCard, copyLimit: number) => boolean;
}>();

const emit = defineEmits<{
  addCard: [card: MtgCard];
  removeCard: [cardId: string];
  quantityChange: [entry: DeckEntry, event: Event];
}>();
</script>

<template>
  <div
    class="deck-grid-view"
    :style="{
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
    }"
  >
    <div v-if="entries.length === 0" class="empty-deck">
      Your deck is empty. Add cards from the left panel!
    </div>

    <div
      v-for="entry in entries"
      :key="entry.card.id"
      class="deck-grid-item"
      :class="{
        'collection-shortage':
          collectionOnly && getDeckEntryShortage(entry) > 0,
        'format-illegal': getDeckEntryWarnings(entry).length > 0
      }"
    >
      <img :src="entry.card.image" :alt="entry.card.name" />

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
          :class="{ 'deck-format-warning--compact': columns >= 5 }"
          :title="getDeckEntryWarnings(entry).join('\n')"
        >
          <span class="format-warning-icon">!</span>
          <span v-if="columns < 5" class="format-warning-label">
            {{ getDeckEntryWarnings(entry)[0] }}
          </span>
        </div>

        <div
          v-if="collectionOnly && getDeckEntryShortage(entry) > 0"
          class="collection-shortage-warning"
          :title="`You need ${getDeckEntryShortage(entry)} more ${entry.card.name} in your collection.`"
        >
          <span class="shortage-exclamation">!</span>
          <span v-if="columns < 5" class="shortage-number">
            {{ getDeckEntryShortage(entry) }} SHORT IN COLLECTION
          </span>
        </div>
      </div>

      <div class="deck-item-controls">
        <div class="qty-buttons">
          <button
            type="button"
            aria-label="Remove one copy"
            @click="emit('removeCard', entry.card.id)"
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
            @change="emit('quantityChange', entry, $event)"
          />

          <button
            type="button"
            aria-label="Add one copy"
            :disabled="
              collectionOnly &&
              !canAddCardFromCollection(
                entry.card,
                getDeckCopyLimit(entry.card)
              )
            "
            @click="emit('addCard', entry.card)"
          >
            +
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/deck-card-grid.css"></style>
