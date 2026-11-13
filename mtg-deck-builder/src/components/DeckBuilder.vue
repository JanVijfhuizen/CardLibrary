
<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useDecks } from '../composables/UseDecks';
import { useCommanderSelection } from '../composables/useCommanderSelection';
import { useDecklistImport } from '../composables/useDecklistImport';
import { useGridColumns } from '../composables/useGridColumns';
import CardBrowser from './CardBrowser.vue';
import DeckCardGrid from './DeckCardGrid.vue';
import DecklistImportDialog from './DecklistImportDialog.vue';
import type {
  MtgCard,
  DeckEntry,
  DeckFormat
} from '../types/mtg';
import {
  FORMAT_OPTIONS,
  getCardCopyLimit,
  validateDeck,
  isCommanderFormat
} from '../services/formatRules';

const {
  activeDeck,
  totalCardCount,
  closeDeck,
  addCard,
  removeCard,
  saveActiveDeck,
  getShareableDecklist,
  getAvailableQuantityForActiveDeck,
  canAddCardFromCollection,
  setCompanion,
  clearCompanion,
  replaceActiveDeckEntries
} = useDecks();

const {
  MIN_COLUMNS,
  MAX_COLUMNS,
  searchColumns,
  deckColumns,
  changeSearchColumns,
  changeDeckColumns,
  validateSearchColumns,
  validateDeckColumns
} = useGridColumns();

const collectionOnly = computed({
  get: () => activeDeck.value?.collectionOnly ?? false,
  set: (value: boolean) => {
    if (activeDeck.value) {
      activeDeck.value.collectionOnly = value;
    }
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

const getDeckCopyLimit = (card: MtgCard): number => {
  return getCardCopyLimit(card, currentFormat.value);
};

const commanderSelection = useCommanderSelection({
  activeDeck,
  currentFormat,
  getDeckCopyLimit,
  getAvailableQuantity: getAvailableQuantityForActiveDeck,
  setCompanion,
  clearCompanion,
  showNotification
});
const {
  commanderCandidates,
  companionCandidates,
  selectedCompanion,
  selectedCompanionId,
  selectedCommanderId,
  selectedCommander,
  compatibleSecondCommanders,
  secondCommanderId,
  selectedCommanders,
  getPairingMechanic,
  getDeckEntryWarnings,
  getDeckEntryShortage
} = commanderSelection;

// Overall deck validation.
const deckValidation = computed(() => {
  if (!activeDeck.value) {
    return {
      status: 'illegal' as const,
      issues: [],
      unknownCards: []
    };
  }

  return validateDeck(activeDeck.value);
});

const deckIssues = computed(() => {
  const result = deckValidation.value;

  const unknownIssues = result.unknownCards.map(
    (name) => `Legality data is missing for ${name}.`
  );

  return [...result.issues, ...unknownIssues];
});

const showDeckIssues = ref(false);
const showCommanderSettings = ref(false);
const showCompanionSettings = ref(false);

const deckIsLegal = computed(
  () => deckValidation.value.status === 'legal'
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

// Manually change the quantity of a card in the deck.
const handleQuantityChange = (
  entry: DeckEntry,
  event: Event
) => {
  const input = event.target as HTMLInputElement;
  const parsed = Number(input.value);

  // Reject empty, invalid, negative, or non-integer values.
  if (
    input.value.trim() === '' ||
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    !Number.isInteger(parsed)
  ) {
    input.value = String(entry.quantity);
    return;
  }

  const targetQuantity = parsed;
  const currentQuantity = entry.quantity;
  const cardId = entry.card.id;

  if (targetQuantity === currentQuantity) return;

  // Remove commander/companion references if the card is removed.
  if (targetQuantity === 0 && activeDeck.value) {
    activeDeck.value.commanderIds =
      activeDeck.value.commanderIds.filter(
        (id) => id !== cardId
      );

    if (selectedCompanion.value?.id === cardId) {
      clearCompanion();
    }
  }

  if (targetQuantity > currentQuantity) {
    // Add copies one at a time, respecting existing restrictions.
    for (let i = currentQuantity; i < targetQuantity; i++) {
      const result = addCard(
        entry.card,
        collectionOnly.value,
        getDeckCopyLimit(entry.card)
      );

      if (!result.success) {
        if (result.message) {
          showNotification(result.message, 'error');
        }
        break;
      }
    }
  } else {
    // Remove copies until the requested quantity is reached.
    for (let i = currentQuantity; i > targetQuantity; i--) {
      removeCard(cardId);
    }
  }

  // Restore the displayed value to the actual deck quantity.
  const updatedEntry = activeDeck.value?.entries.find(
    (item) => item.card.id === cardId
  );

  input.value = String(updatedEntry?.quantity ?? 0);
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

onUnmounted(() => {
  if (notificationTimeout) clearTimeout(notificationTimeout);
});

// Custom format dropdown.
const formatDropdownOpen = ref(false);

const selectedFormatLabel = computed(() => {
  return FORMAT_OPTIONS.find(
    (format) => format.value === currentFormat.value
  )?.label ?? 'Standard';
});

const selectFormat = (format: DeckFormat) => {
  if (!activeDeck.value) return;

  activeDeck.value.format = format;
  formatDropdownOpen.value = false;
};


const {
  showImportDialog,
  importText,
  isImporting,
  importError,
  importPreview,
  resolveImport,
  confirmImport,
  cancelImport
} = useDecklistImport({
  activeDeck,
  replaceEntries: replaceActiveDeckEntries,
  showNotification: message => showNotification(message)
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

        <button
        type="button"
        class="secondary-btn"
        @click="showImportDialog = true"
        >
        Import Decklist
        </button>

        <button @click="handleSave" class="primary-btn">
          Save Deck
        </button>
      </div>
    </header>

    <div class="builder-workspace">
      <CardBrowser
        :current-format="currentFormat"
        :collection-only="collectionOnly"
        :columns="searchColumns"
        :min-columns="MIN_COLUMNS"
        :max-columns="MAX_COLUMNS"
        @add-card="handleAdd"
        @change-columns="changeSearchColumns"
        @update-columns="searchColumns = $event"
        @validate-columns="validateSearchColumns"
      />

      <!-- Deck Workspace -->
      <div class="pane deck-workspace">
        <!-- Deck heading and format dropdown -->
        
        <!-- Compact deck controls -->
        <div class="deck-workspace-header">
          <div class="deck-header-controls">
            <div class="format-settings">
              <label for="deck-format">Format</label>

              <div
                v-if="activeDeck"
                class="format-dropdown"
                :class="{
                  'format-dropdown--open': formatDropdownOpen
                }"
              >
                <button
                  id="deck-format"
                  type="button"
                  class="format-dropdown__trigger"
                  :class="{
                    'format-dropdown__trigger--featured':
                      FORMAT_OPTIONS.some(
                        (format) =>
                          format.value === currentFormat &&
                          format.featured
                      )
                  }"
                  :aria-expanded="formatDropdownOpen"
                  aria-haspopup="listbox"
                  @click="formatDropdownOpen = !formatDropdownOpen"
                >
                  <span>{{ selectedFormatLabel }}</span>
                  <span class="format-dropdown__chevron">▾</span>
                </button>

                <div
                  v-if="formatDropdownOpen"
                  class="format-dropdown__menu"
                  role="listbox"
                  aria-label="Choose deck format"
                >
                  <button
                    v-for="format in FORMAT_OPTIONS"
                    :key="format.value"
                    type="button"
                    role="option"
                    :aria-selected="currentFormat === format.value"
                    class="format-dropdown__option"
                    :class="{
                      'format-dropdown__option--featured': format.featured,
                      'format-dropdown__option--active':
                        currentFormat === format.value
                    }"
                    @click="selectFormat(format.value)"
                  >
                    <span class="format-dropdown__option-name">
                      <span
                        v-if="format.featured"
                        class="format-dropdown__star"
                      >
                        ✦
                      </span>
                      {{ format.label }}
                    </span>

                    <span
                      v-if="format.popular"
                      class="format-dropdown__popular"
                    >
                      POPULAR
                    </span>

                    <span
                      v-if="currentFormat === format.value"
                      class="format-dropdown__check"
                    >
                      ✓
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div class="collection-mode-bar">
              <label>
                <input
                  v-model="collectionOnly"
                  type="checkbox"
                />
                Use collection for deck
              </label>
            </div>

            <div class="grid-column-control deck-column-control">
              <label for="deck-columns">Cards per row</label>

              <div class="grid-column-input">
                <button
                  type="button"
                  aria-label="Decrease deck cards per row"
                  :disabled="deckColumns <= MIN_COLUMNS"
                  @click="changeDeckColumns(-1)"
                >
                  −
                </button>

                <input
                  id="deck-columns"
                  v-model.number="deckColumns"
                  type="number"
                  :min="MIN_COLUMNS"
                  :max="MAX_COLUMNS"
                  step="1"
                  @change="validateDeckColumns"
                />

                <button
                  type="button"
                  aria-label="Increase deck cards per row"
                  :disabled="deckColumns >= MAX_COLUMNS"
                  @click="changeDeckColumns(1)"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

               <!-- Commander and Companion Selection -->
        <div class="commander-companion-row">
          <!-- Commander Selection -->
          <div
            v-if="isCommanderFormat(currentFormat)"
            class="commander-settings"
          >
            <div class="commander-settings-header">
              <div>
                <strong>Commander Selection</strong>
                <span class="commander-summary">
                  {{
                    selectedCommanders.length
                      ? selectedCommanders.map((card) => card.name).join(' + ')
                      : 'No commander selected'
                  }}
                </span>
              </div>

              <button
                type="button"
                class="commander-toggle"
                :aria-expanded="showCommanderSettings"
                @click="showCommanderSettings = !showCommanderSettings"
              >
                {{ showCommanderSettings ? 'Collapse ▲' : 'Edit ▼' }}
              </button>
            </div>

            <div v-if="showCommanderSettings" class="commander-settings-body">
              <label for="commander-select">
                Primary commander
              </label>

              <select
                id="commander-select"
                v-model="selectedCommanderId"
              >
                <option value="">-- Select a commander --</option>

                <option
                  v-for="card in commanderCandidates"
                  :key="card.id"
                  :value="card.id"
                >
                  {{ card.name }}
                </option>
              </select>

              <p
                v-if="commanderCandidates.length === 0"
                class="commander-help"
              >
                Add an eligible legendary creature to your deck first.
              </p>

              <div
                v-if="selectedCommanderId && compatibleSecondCommanders.length > 0"
                class="second-commander-selection"
              >
                <label for="second-commander-select">
                  Second commander
                </label>

                <select
                  id="second-commander-select"
                  v-model="secondCommanderId"
                >
                  <option value="">-- No second commander --</option>

                  <option
                    v-for="card in compatibleSecondCommanders"
                    :key="card.id"
                    :value="card.id"
                  >
                    {{ card.name }}
                  </option>
                </select>

                <p
                  v-if="selectedCommander && secondCommanderId"
                  class="commander-help"
                >
                  Pairing mechanic:
                  {{ getPairingMechanic(
                    selectedCommander,
                    selectedCommanders[1]
                  ) }}
                </p>
              </div>
            </div>
          </div>

          <!-- Companion Selection -->
          <div
            v-if="companionCandidates.length > 0 || selectedCompanion"
            class="commander-settings companion-settings"
          >
            <div class="commander-settings-header">
              <div>
                <strong>Companion Selection</strong>

                <span class="commander-summary">
                  {{ selectedCompanion?.name ?? 'No companion selected' }}
                </span>
              </div>

              <button
                type="button"
                class="commander-toggle"
                :aria-expanded="showCompanionSettings"
                @click.stop="showCompanionSettings = !showCompanionSettings"
              >
                {{ showCompanionSettings ? 'Collapse ▲' : 'Edit ▼' }}
              </button>
            </div>

            <div
              v-show="showCompanionSettings"
              class="commander-settings-body"
            >
              <label for="companion-select">
                Companion
              </label>

              <select
                id="companion-select"
                v-model="selectedCompanionId"
              >
                <option value="">-- No companion --</option>

                <option
                  v-for="card in companionCandidates"
                  :key="card.id"
                  :value="card.id"
                >
                  {{ card.name }}
                </option>
              </select>

              <p class="commander-help">
                {{
                  selectedCompanion
                    ? `${selectedCompanion.name} is selected as your companion.`
                    : 'Select a companion card already included in your deck.'
                }}
              </p>
            </div>
          </div>
        </div>

        <!-- Collapsible Format Validation -->
        <div
          v-if="deckIssues.length > 0"
          class="deck-validation validation-invalid"
        >
          <div class="deck-validation-header">
            <strong>
              {{ deckIssues.length }} format
              {{ deckIssues.length === 1 ? 'issue' : 'issues' }}
            </strong>

            <button
              type="button"
              class="deck-validation-toggle"
              :aria-expanded="showDeckIssues"
              @click="showDeckIssues = !showDeckIssues"
            >
              {{ showDeckIssues ? 'Hide issues ▲' : 'Show issues ▼' }}
            </button>
          </div>

          <ul v-if="showDeckIssues">
            <li
              v-for="(issue, index) in deckIssues"
              :key="index"
            >
              {{ issue }}
            </li>
          </ul>
        </div>

        <DeckCardGrid
          :entries="activeDeck?.entries ?? []"
          :columns="deckColumns"
          :collection-only="collectionOnly"
          :get-deck-entry-warnings="getDeckEntryWarnings"
          :get-deck-entry-shortage="getDeckEntryShortage"
          :get-deck-copy-limit="getDeckCopyLimit"
          :can-add-card-from-collection="canAddCardFromCollection"
          @add-card="handleAdd"
          @remove-card="removeCard"
          @quantity-change="handleQuantityChange"
        />
      </div>
    </div>
    <DecklistImportDialog
      v-if="showImportDialog"
      v-model:text="importText"
      :is-importing="isImporting"
      :error="importError"
      :preview="importPreview"
      @resolve="resolveImport"
      @confirm="confirmImport"
      @cancel="cancelImport"
      @edit="importPreview = null"
    />
  </div>
</template>

<style scoped src="../styles/deck-builder.css"></style>
