
<script setup lang="ts">
import { onMounted } from 'vue';
import { useDecks } from '../composables/UseDecks';
import type { Deck } from '../types/mtg';

const emit = defineEmits<{
  openCollection: [];
}>();

const {
  savedDecks,
  loadSavedDecks,
  startNewDeck,
  openDeck,
  deleteDeck
} = useDecks();

onMounted(() => {
  loadSavedDecks();
});

const handleCreate = () => {
  startNewDeck();
};

const handleOpen = (deck: Deck) => {
  openDeck(deck);
};

const handleDelete = (id: string) => {
  if (confirm('Are you sure you want to delete this deck?')) {
    deleteDeck(id);
  }
};

const totalCardCountForDeck = (deck: Deck): number => {
  return deck.entries.reduce(
    (sum, entry) => sum + entry.quantity,
    0
  );
};
</script>

<template>
  <div class="screen overview-screen">
    <header class="overview-header">
      <div class="overview-heading">
        <h1>My Decks</h1>
        <p>Your Magic: The Gathering collection</p>
      </div>

      <div class="overview-header-actions">
        <button
          class="secondary-btn collection-nav-btn"
          @click="emit('openCollection')"
        >
          My Collection
        </button>

        <button
          @click="handleCreate"
          class="primary-btn new-deck-btn"
        >
          <span>+</span> New Deck
        </button>
      </div>
    </header>

    <div v-if="savedDecks.length === 0" class="empty-state">
      <div class="empty-state-icon">✦</div>
      <h2>No decks yet</h2>
      <p>
        Your deck collection is waiting.
        Create your first deck to get started!
      </p>

      <button @click="handleCreate" class="primary-btn">
        + Create Your First Deck
      </button>
    </div>

    <div v-else class="deck-grid">
      <article
        v-for="deck in savedDecks"
        :key="deck.id"
        class="deck-card"
      >
        <div class="deck-preview">
          <div
            v-if="deck.entries.length > 0"
            class="deck-artwork"
            :class="`card-count-${Math.min(deck.entries.length, 4)}`"
          >
            <div
              v-for="(entry, index) in deck.entries.slice(0, 4)"
              :key="entry.card.id"
              class="preview-card"
              :class="`preview-card-${index + 1}`"
            >
              <img
                v-if="entry.card.image"
                :src="entry.card.image"
                :alt="entry.card.name"
                loading="lazy"
              />

              <div v-else class="preview-card-placeholder">
                <span>MTG</span>
              </div>
            </div>
          </div>

          <div v-else class="empty-deck-preview">
            <span class="empty-preview-symbol">✦</span>
            <span>Empty Deck</span>
          </div>

          <div class="preview-card-count">
            {{ totalCardCountForDeck(deck) }} cards
          </div>
        </div>

        <div class="deck-card-info">
          <div class="deck-title-row">
            <h2 :title="deck.name">{{ deck.name }}</h2>
          </div>

          <p class="deck-description">
            {{ deck.entries.length }} unique
            {{ deck.entries.length === 1 ? 'card' : 'cards' }}
          </p>

          <div class="deck-card-actions">
            <button
              @click="handleOpen(deck)"
              class="primary-btn open-deck-btn"
            >
              Open Deck
            </button>

            <button
              @click="handleDelete(deck.id)"
              class="danger-btn delete-deck-btn"
              aria-label="Delete deck"
              title="Delete deck"
            >
              Delete
            </button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped src="../styles/deck-overview.css"></style>
