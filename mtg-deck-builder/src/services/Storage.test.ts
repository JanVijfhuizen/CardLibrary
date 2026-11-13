import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deck, MtgCard } from '../types/mtg';
import { StorageService } from './Storage';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const card: MtgCard = {
  id: 'sol-ring',
  name: 'Sol Ring',
  type: 'Artifact',
  color: 'Colorless',
  cost: 1,
  tags: [],
  image: 'sol-ring.jpg'
};

function deck(id: string, name = 'Test Deck'): Deck {
  return {
    id,
    name,
    entries: [],
    updatedAt: '',
    collectionOnly: false,
    format: 'any',
    commanderIds: []
  };
}

describe('StorageService', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns empty lists when storage is empty', () => {
    expect(StorageService.getDecks()).toEqual([]);
    expect(StorageService.getCollection()).toEqual([]);
  });

  it('creates and updates saved decks without duplicating them', () => {
    StorageService.saveDeck(deck('one', 'Original'));
    const updated = StorageService.saveDeck(deck('one', 'Renamed'));

    expect(updated.name).toBe('Renamed');
    expect(StorageService.getDecks()).toHaveLength(1);
    expect(StorageService.getDecks()[0].name).toBe('Renamed');
    expect(updated.updatedAt).not.toBe('');
  });

  it('deletes only the requested deck', () => {
    StorageService.saveDeck(deck('one'));
    StorageService.saveDeck(deck('two'));

    StorageService.deleteDeck('one');

    expect(StorageService.getDecks().map(({ id }) => id)).toEqual(['two']);
  });

  it('returns an empty deck list and logs when stored JSON is invalid', () => {
    localStorage.setItem('mtg_saved_decks_v1', '{');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(StorageService.getDecks()).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });

  it('sets exact collection quantities and updates existing entries', () => {
    StorageService.setCollectionQuantity(card, 2);
    StorageService.setCollectionQuantity({ ...card, name: 'Updated Sol Ring' }, 4);

    expect(StorageService.getCollection()).toEqual([
      { card: { ...card, name: 'Updated Sol Ring' }, quantity: 4 }
    ]);
    expect(StorageService.getCollectionQuantity(card.id)).toBe(4);
  });

  it('floors positive quantities and removes entries at zero', () => {
    StorageService.setCollectionQuantity(card, 2.9);
    expect(StorageService.getCollectionQuantity(card.id)).toBe(2);

    StorageService.setCollectionQuantity(card, 0);

    expect(StorageService.getCollection()).toEqual([]);
  });

  it('ignores malformed and non-positive collection entries', () => {
    localStorage.setItem('mtg_collection_v1', JSON.stringify([
      { card, quantity: 2 },
      { card, quantity: 0 },
      { card, quantity: -1 },
      { card: { name: 'No ID' }, quantity: 1 },
      null
    ]));

    expect(StorageService.getCollection()).toEqual([{ card, quantity: 2 }]);
  });

  it('removes one card from the collection without affecting other cards', () => {
    StorageService.setCollectionQuantity(card, 3);
    StorageService.setCollectionQuantity({ ...card, id: 'island' }, 1);

    StorageService.removeFromCollection(card.id);

    expect(StorageService.getCollection().map(({ card: item }) => item.id))
      .toEqual(['island']);
  });

  it('surfaces collection write failures to the caller', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage is full');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => StorageService.setCollectionQuantity(card, 1))
      .toThrow('storage is full');
  });
});
