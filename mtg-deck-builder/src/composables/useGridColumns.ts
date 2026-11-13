import { ref, watch } from 'vue';

const MIN_COLUMNS = 3;
const MAX_COLUMNS = 6;

function clampColumns(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return MAX_COLUMNS;

  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(parsed)));
}

function getSavedColumns(key: string): number {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? MAX_COLUMNS : clampColumns(Number(saved));
  } catch {
    return MAX_COLUMNS;
  }
}

export function useGridColumns() {
  const searchColumns = ref(getSavedColumns('mtg_search_columns'));
  const deckColumns = ref(getSavedColumns('mtg_deck_columns'));

  const saveColumns = (key: string, value: number) => {
    try {
      localStorage.setItem(key, String(clampColumns(value)));
    } catch (error) {
      console.error('Could not save grid column setting:', error);
    }
  };

  const changeSearchColumns = (amount: number) => {
    searchColumns.value = clampColumns(searchColumns.value + amount);
  };

  const changeDeckColumns = (amount: number) => {
    deckColumns.value = clampColumns(deckColumns.value + amount);
  };

  const validateSearchColumns = () => {
    searchColumns.value = clampColumns(searchColumns.value);
  };

  const validateDeckColumns = () => {
    deckColumns.value = clampColumns(deckColumns.value);
  };

  watch(
    searchColumns,
    value => saveColumns('mtg_search_columns', value),
    { immediate: true }
  );
  watch(
    deckColumns,
    value => saveColumns('mtg_deck_columns', value),
    { immediate: true }
  );

  return {
    MIN_COLUMNS,
    MAX_COLUMNS,
    searchColumns,
    deckColumns,
    changeSearchColumns,
    changeDeckColumns,
    validateSearchColumns,
    validateDeckColumns
  };
}
