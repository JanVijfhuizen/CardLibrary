
<script setup lang="ts">
import { onMounted } from 'vue';
import { useDecks } from '../composables/UseDecks';
import type { Deck, DeckFormat, MtgCard, DeckEntry } from '../types/mtg';

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

type DeckStatus = 'legal' | 'illegal' | 'incomplete';

interface DeckValidation {
  status: DeckStatus;
  issues: string[];
  unknownCards: string[];
}

const getDeckCopyLimit = (
  card: MtgCard,
  format: DeckFormat
): number => {
  if (
    format === 'any' ||
    /\bBasic\b/i.test(card.type) ||
    /a deck can have any number of cards named/i.test(
      card.oracleText ?? ''
    )
  ) {
    return 999;
  }

  return format === 'commander' ? 1 : 4;
};

const getCopyLimitShortage = (
  deck: Deck,
  entry: DeckEntry
): number => {
  const limit = getDeckCopyLimit(entry.card, deck.format ?? 'standard');

  const totalCopies = deck.entries
    .filter(
      (item) =>
        item.card.name.toLowerCase() ===
        entry.card.name.toLowerCase()
    )
    .reduce((total, item) => total + item.quantity, 0);

  return Math.max(0, totalCopies - limit);
};

// Commander validation helpers. These mirror DeckBuilder.vue.

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

  return type.includes('legendary') && type.includes('creature');
};

const isValidSecondCommanderCard = (card: MtgCard): boolean => {
  return isCommanderEligible(card) || isBackground(card);
};

const hasPartnerWith = (card: MtgCard, other: MtgCard): boolean => {
  const match = (card.oracleText ?? '').match(
    /partner with ([^(.\n]+)/i
  );

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

const hasCommanderIdentityViolation = (
  card: MtgCard,
  commanders: MtgCard[]
): boolean => {
  if (commanders.length === 0) return false;

  const identity = new Set<string>();

  commanders.forEach((commander) => {
    (commander.colorIdentity ?? []).forEach((color) => {
      identity.add(color);
    });
  });

  return (card.colorIdentity ?? []).some(
    (color) => !identity.has(color)
  );
};

const getDeckValidation = (deck: Deck): DeckValidation => {
  const format = deck.format ?? 'standard';
  const issues: string[] = [];
  const unknownCards: string[] = [];
  const totalCards = totalCardCountForDeck(deck);

  if (format === 'any') {
    return {
      status: 'legal',
      issues,
      unknownCards
    };
  }

  if (format === 'standard' && totalCards < 60) {
    issues.push(
      `Standard requires at least 60 cards. This deck has ${totalCards}.`
    );
  }

  let selectedCommanders: MtgCard[] = [];

  if (format === 'commander') {
    if (totalCards !== 100) {
      issues.push(
        `Commander requires exactly 100 cards. This deck has ${totalCards}.`
      );
    }

    const ids = deck.commanderIds ?? [];

    selectedCommanders = ids
      .map((id) =>
        deck.entries.find((entry) => entry.card.id === id)?.card
      )
      .filter((card): card is MtgCard => Boolean(card));

    if (ids.length === 0) {
      issues.push('Select a commander.');
    } else if (selectedCommanders.length !== ids.length) {
      issues.push('Your selected commander is not present in the deck.');
    } else if (ids.length === 1) {
      if (!isCommanderEligible(selectedCommanders[0])) {
        issues.push(
          'Your selected card is not a valid commander.'
        );
      }
    } else if (ids.length === 2) {
      const [first, second] = selectedCommanders;

      if (
        !isCommanderEligible(first) ||
        !isValidSecondCommanderCard(second) ||
        !canPairCommanders(first, second)
      ) {
        issues.push(
          'Your commander selection is not a valid commander or permitted commander pair.'
        );
      }
    } else {
      issues.push(
        'Your commander selection is not a valid commander or permitted commander pair.'
      );
    }

    if (ids.length > 2) {
      issues.push('A Commander deck can have at most two commanders.');
    }
  }

  deck.entries.forEach((entry) => {
    const legality = entry.card.legalities?.[format] ?? 'unknown';

    if (legality === 'banned') {
      issues.push(
        `${entry.card.name} is banned in ${format}.`
      );
    } else if (legality === 'not_legal') {
      issues.push(
        `${entry.card.name} is not legal in ${format}.`
      );
    } else if (legality === 'unknown') {
      unknownCards.push(entry.card.name);
    }

    const shortage = getCopyLimitShortage(deck, entry);

    if (shortage > 0) {
      issues.push(
        `${entry.card.name} exceeds the copy limit by ${shortage}.`
      );
    }

    if (
      format === 'commander' &&
      hasCommanderIdentityViolation(entry.card, selectedCommanders)
    ) {
      issues.push(
        `${entry.card.name} is outside your commander's color identity.`
      );
    }
  });

  const uniqueIssues = [...new Set(issues)];
  const uniqueUnknownCards = [...new Set(unknownCards)];

  let status: DeckStatus = 'legal';

  if (uniqueIssues.length > 0) {
    status = 'illegal';
  } else if (uniqueUnknownCards.length > 0) {
    status = 'incomplete';
  }

  return {
    status,
    issues: uniqueIssues,
    unknownCards: uniqueUnknownCards
  };
};

const getFormatName = (deck: Deck): string => {
  const format = deck.format ?? 'standard';

  if (format === 'any') return 'Any';
  if (format === 'commander') return 'Commander';

  return 'Standard';
};

const getStatusLabel = (status: DeckStatus): string => {
  if (status === 'legal') return 'LEGAL';
  if (status === 'illegal') return 'ILLEGAL';

  return 'INCOMPLETE';
};

const getStatusDescription = (deck: Deck): string => {
  const validation = getDeckValidation(deck);

  if (validation.status === 'illegal') {
    return validation.issues.join('\n');
  }

  if (validation.status === 'incomplete') {
    return `Legality data is missing for: ${validation.unknownCards.join(', ')}`;
  }

  return 'This deck passes the current format checks.';
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
            v-if="getDeckValidation(deck).issues.length > 0"
            class="deck-validation-details"
            :title="getDeckValidation(deck).issues.join('\n')"
          >
            {{ getDeckValidation(deck).issues.length }}
            format issue(s)
          </div>

          <div
            v-else-if="getDeckValidation(deck).unknownCards.length > 0"
            class="deck-validation-details incomplete-details"
            :title="getStatusDescription(deck)"
          >
            Missing legality data for
            {{ getDeckValidation(deck).unknownCards.length }}
            card(s)
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
