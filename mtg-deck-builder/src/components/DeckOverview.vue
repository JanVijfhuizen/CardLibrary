<script setup lang="ts">
import { onMounted } from 'vue';
import { useDecks } from '../composables/UseDecks';
import { Deck } from '../types/mtg';

const { savedDecks, loadSavedDecks, startNewDeck, openDeck, deleteDeck, totalCardCount } = useDecks();

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
</script>

<template>
  <div class="screen overview-screen">
    <header class="overview-header">
      <h1>My Decks</h1>
      <button @click="handleCreate" class="primary-btn">+ New Deck</button>
    </header>

    <div v-if="savedDecks.length === 0" class="empty-state">
      <p>No saved decks found. Click "+ New Deck" to start building!</p>
    </div>

    <div class="deck-grid">
      <div v-for="deck in savedDecks" :key="deck.id" class="deck-card">
        <div class="deck-card-info">
          <h3>{{ deck.name }}</h3>
          <p>{{ totalCardCountForDeck(deck) }} cards</p>
        </div>
        <div class="deck-card-actions">
          <button @click="handleOpen(deck)" class="primary-btn">Open</button>
          <button @click="handleDelete(deck.id)" class="danger-btn">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
// Helper function inside component scope for deck total count calculation
function totalCardCountForDeck(deck: Deck): number {
  return deck.entries.reduce((sum, entry) => sum + entry.quantity, 0);
}
</script>

<style scoped src="../styles/deck-overview.css"></style>