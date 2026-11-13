
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useDecks } from '../composables/UseDecks';
import type { Deck } from '../types/mtg';
import type { DeckValidation } from '../services/formatRules';
import {
  getFormatName as getDeckFormatName,
  validateDeck
} from '../services/formatRules';

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

const totalCardCountForDeck = (deck: Deck): number => {
  return deck.entries.reduce(
    (sum, entry) => sum + entry.quantity,
    0
  );
};

// Commander decks display only their selected commander(s).
const getDeckPreviewEntries = (deck: Deck) => {
  if (deck.format === 'commander') {
    const commanderEntries = deck.entries.filter((entry) =>
      deck.commanderIds?.includes(entry.card.id)
    );

    const previewEntries = [...commanderEntries];

    if (
      deck.companionCard &&
      !previewEntries.some(
        (entry) => entry.card.id === deck.companionCard!.id
      )
    ) {
      previewEntries.push({
        card: deck.companionCard,
        quantity: 1
      });
    }

    if (previewEntries.length > 0) {
      return previewEntries;
    }
  }

  return deck.entries;
};

type DeckStatus = DeckValidation['status'];

// Include both format-rule issues and cards with missing legality data.
const getDeckIssues = (deck: Deck): string[] => {
  const validation = validateDeck(deck);

  const unknownIssues = validation.unknownCards.map(
    (name) => `Legality data is missing for ${name}.`
  );

  return [
    ...validation.issues,
    ...unknownIssues
  ];
};

const getDeckValidation = (deck: Deck): DeckValidation => {
  return validateDeck(deck);
};

const getStatusLabel = (status: DeckStatus): string => {
  if (status === 'legal') return 'LEGAL';
  if (status === 'illegal') return 'ILLEGAL';

  return 'INCOMPLETE';
};

const getStatusDescription = (deck: Deck): string => {
  return getDeckIssues(deck).join('\n');
};

const showDeleteDialog = ref(false);
const deckToDelete = ref<string | null>(null);

const requestDeleteDeck = (deckId: string) => {
  deckToDelete.value = deckId;
  showDeleteDialog.value = true;
};

const cancelDeleteDeck = () => {
  showDeleteDialog.value = false;
  deckToDelete.value = null;
};

const confirmDeleteDeck = () => {
  if (!deckToDelete.value) return;

  deleteDeck(deckToDelete.value);

  showDeleteDialog.value = false;
  deckToDelete.value = null;
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
            v-if="getDeckPreviewEntries(deck).length > 0"
            class="deck-artwork"
            :class="`card-count-${Math.min(getDeckPreviewEntries(deck).length, 4)}`"
          >
            <div
              v-for="(entry, index) in getDeckPreviewEntries(deck).slice(0, 4)"
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

          <div class="deck-meta-row">
            <span class="deck-format-label">
              {{ getDeckFormatName(deck.format) }}
            </span>

            <span
              class="deck-status"
              :class="`status-${getDeckValidation(deck).status}`"
              :title="getStatusDescription(deck)"
            >
              {{ getStatusLabel(getDeckValidation(deck).status) }}
            </span>
          </div>

          <p class="deck-description">
            {{ deck.entries.length }} unique
            {{ deck.entries.length === 1 ? 'card' : 'cards' }}
          </p>

          <div
            v-if="getDeckIssues(deck).length > 0"
            class="deck-validation-details"
            :title="getStatusDescription(deck)"
          >
            {{ getDeckIssues(deck).length }}
            validation issue(s)
          </div>

          <div class="deck-card-actions">
            <button
              @click="handleOpen(deck)"
              class="primary-btn open-deck-btn"
            >
              Open Deck
            </button>

            <button
              type="button"
              class="delete-deck-btn"
              @click="requestDeleteDeck(deck.id)"
            >
              Delete
            </button>
          </div>
        </div>
      </article>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="showDeleteDialog"
      class="delete-dialog-backdrop"
      @click.self="cancelDeleteDeck"
    >
        <div
          class="delete-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div class="delete-dialog-icon">!</div>

          <h2 id="delete-dialog-title">Delete this deck?</h2>

          <p>
            This deck will be permanently removed. This action cannot be undone.
          </p>

          <div class="delete-dialog-actions">
            <button
              type="button"
              class="delete-dialog-cancel"
              @click="cancelDeleteDeck"
            >
              Keep Deck
            </button>

            <button
              type="button"
              class="delete-dialog-confirm"
              @click="confirmDeleteDeck"
            >
              Delete Deck
            </button>
          </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="../styles/deck-overview.css"></style>
