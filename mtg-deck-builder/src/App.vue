<script setup lang="ts">
import { useDecks } from './composables/UseDecks';
import DeckOverview from './components/DeckOverview.vue';
import DeckBuilder from './components/DeckBuilder.vue';

const { activeDeck } = useDecks();
</script>

<template>
  <main class="app-container">
    <DeckBuilder v-if="activeDeck" />
    <DeckOverview v-else />
  </main>
</template>

<style src="./styles/app.css"></style>