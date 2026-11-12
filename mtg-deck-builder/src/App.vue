
<script setup lang="ts">
import { ref } from 'vue';
import { useDecks } from './composables/UseDecks';
import DeckOverview from './components/DeckOverview.vue';
import DeckBuilder from './components/DeckBuilder.vue';
import Collection from './components/Collection.vue';

const { activeDeck } = useDecks();

const currentView = ref<'decks' | 'collection'>('decks');
</script>

<template>
  <main class="app-container">
    <DeckBuilder
      v-if="activeDeck"
    />

    <Collection
      v-else-if="currentView === 'collection'"
      @back="currentView = 'decks'"
    />

    <DeckOverview
      v-else
      @open-collection="currentView = 'collection'"
    />
  </main>
</template>

<style src="./styles/app.css"></style>
