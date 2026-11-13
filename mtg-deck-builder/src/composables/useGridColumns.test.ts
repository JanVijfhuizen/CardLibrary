import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGridColumns } from './useGridColumns';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

describe('useGridColumns', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults to six columns and persists both settings', async () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const columns = useGridColumns();

    expect(columns.searchColumns.value).toBe(6);
    expect(columns.deckColumns.value).toBe(6);
    expect(storage.getItem('mtg_search_columns')).toBe('6');
    expect(storage.getItem('mtg_deck_columns')).toBe('6');

    columns.changeSearchColumns(-1);
    await nextTick();
    expect(storage.getItem('mtg_search_columns')).toBe('5');
  });

  it('clamps both controls to the supported minimum and maximum', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const columns = useGridColumns();

    columns.searchColumns.value = -10;
    columns.validateSearchColumns();
    columns.deckColumns.value = 10;
    columns.validateDeckColumns();

    expect(columns.searchColumns.value).toBe(columns.MIN_COLUMNS);
    expect(columns.deckColumns.value).toBe(columns.MAX_COLUMNS);
  });

  it('rounds saved values and falls back when storage is unavailable', () => {
    const storage = new MemoryStorage();
    storage.setItem('mtg_search_columns', '4.6');
    storage.setItem('mtg_deck_columns', 'invalid');
    vi.stubGlobal('localStorage', storage);

    const columns = useGridColumns();

    expect(columns.searchColumns.value).toBe(5);
    expect(columns.deckColumns.value).toBe(6);

    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('storage disabled');
      },
      setItem() {
        throw new Error('storage disabled');
      }
    });

    expect(useGridColumns().searchColumns.value).toBe(6);
  });
});
