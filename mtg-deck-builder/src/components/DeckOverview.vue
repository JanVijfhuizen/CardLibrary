
<script setup lang="ts">
import { onMounted } from 'vue';
import { useDecks } from '../composables/UseDecks';
import type { Deck, DeckValidation } from '../services/formatRules';
import { validateDeck } from '../services/formatRules';

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

const getDeckValidation = (deck: Deck): DeckValidation => {
  return validateDeck(deck);
};

// Include both format-rule issues and cards with missing legality data.
const getDeckIssues = (deck: Deck): string[] => {
  const validation = getDeckValidation(deck);

  const unknownIssues = validation.unknownCards.map(
    (name) => `Legality data is missing for ${name}.`
  );

  return [
    ...validation.issues,
    ...unknownIssues
  ];
};

const getFormatName = (deck: Deck): string => {
  const format = deck.format ?? 'standard';

  if (format === 'any') return 'Unrestricted';
  if (format === 'commander') return 'Commander';

  return format.charAt(0).toUpperCase() + format.slice(1);
};

const getStatusLabel = (status: DeckStatus): string => {
  if (status === 'legal') return 'LEGAL';
  if (status === 'illegal') return 'ILLEGAL';

  return 'INCOMPLETE';
};

const getStatusDescription = (deck: Deck): string => {
  return getDeckIssues(deck).join('\n');
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
              {{ getFormatName(deck) }}
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
