<script setup lang="ts">
import type { DecklistResolution } from '../services/Scryfall';

const importText = defineModel<string>('text', { required: true });

defineProps<{
  isImporting: boolean;
  error: string;
  preview: DecklistResolution | null;
}>();

const emit = defineEmits<{
  resolve: [];
  confirm: [];
  cancel: [];
  edit: [];
}>();
</script>

<template>
  <div
    class="import-dialog-backdrop"
    @click.self="emit('cancel')"
  >
    <div class="import-dialog">
      <div class="import-dialog-header">
        <h2>Import Decklist</h2>

        <button
          type="button"
          class="secondary-btn"
          @click="emit('cancel')"
        >
          ✕
        </button>
      </div>

      <p>
        Paste a decklist below. Card names and quantities will be resolved
        through Scryfall.
      </p>

      <textarea
        v-model="importText"
        class="import-decklist-input"
        placeholder="4 Lightning Bolt&#10;4 Mountain&#10;1 Sol Ring&#10;Commander: Atraxa, Praetors' Voice"
        rows="12"
        :disabled="isImporting"
      ></textarea>

      <p v-if="error" class="import-error">
        {{ error }}
      </p>

      <button
        v-if="!preview"
        type="button"
        class="primary-btn"
        :disabled="isImporting || !importText.trim()"
        @click="emit('resolve')"
      >
        {{ isImporting ? 'Resolving cards...' : 'Resolve Decklist' }}
      </button>

      <div v-if="preview" class="import-preview">
        <h3>Import Preview</h3>

        <p>
          {{ preview.entries.reduce((sum, entry) => sum + entry.quantity, 0) }}
          cards across {{ preview.entries.length }} unique cards.
        </p>

        <p v-if="preview.commanderNames.length">
          <strong>Commander:</strong>
          {{ preview.commanderNames.join(' + ') }}
        </p>

        <p v-if="preview.companionName">
          <strong>Companion:</strong>
          {{ preview.companionName }}
        </p>

        <div class="import-preview-list">
          <div
            v-for="entry in preview.entries"
            :key="entry.card.id"
            class="import-preview-entry"
          >
            <span>{{ entry.card.name }}</span>
            <strong>{{ entry.quantity }}x</strong>
          </div>
        </div>

        <div v-if="preview.notFound.length" class="import-not-found">
          <strong>
            {{ preview.notFound.length }} card names not found:
          </strong>

          <ul>
            <li v-for="name in preview.notFound" :key="name">
              {{ name }}
            </li>
          </ul>
        </div>

        <div class="import-dialog-actions">
          <button
            type="button"
            class="secondary-btn"
            @click="emit('edit')"
          >
            Edit List
          </button>

          <button
            type="button"
            class="primary-btn"
            @click="emit('confirm')"
          >
            Replace Current Deck
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/import-dialog.css"></style>
