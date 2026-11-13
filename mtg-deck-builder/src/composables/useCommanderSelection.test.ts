import { computed, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Deck, MtgCard } from '../types/mtg';
import { useCommanderSelection } from './useCommanderSelection';

function card(overrides: Partial<MtgCard> = {}): MtgCard {
  return {
    id: 'card',
    name: 'Card',
    type: 'Creature',
    color: 'U',
    cost: 1,
    tags: [],
    image: '',
    colorIdentity: ['U'],
    legalities: { commander: 'legal' },
    ...overrides
  };
}

function createDeck(entries: Deck['entries'] = [], format: Deck['format'] = 'commander'): Deck {
  return {
    id: 'deck',
    name: 'Deck',
    entries,
    updatedAt: '',
    collectionOnly: false,
    format,
    commanderIds: []
  };
}

function selection(deck: Deck) {
  const activeDeck = ref<Deck | null>(deck);
  const showNotification = vi.fn();
  const setCompanion = vi.fn((companion: MtgCard) => {
    if (!activeDeck.value) return { success: false };
    activeDeck.value.companionCard = companion;
    return { success: true };
  });
  const clearCompanion = vi.fn(() => {
    if (activeDeck.value) activeDeck.value.companionCard = undefined;
  });

  return {
    activeDeck,
    showNotification,
    setCompanion,
    clearCompanion,
    controls: useCommanderSelection({
      activeDeck,
      currentFormat: computed(() => activeDeck.value?.format ?? 'any'),
      getDeckCopyLimit: () => 4,
      getAvailableQuantity: () => 2,
      setCompanion,
      clearCompanion,
      showNotification
    })
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCommanderSelection', () => {
  it('offers eligible commanders and compatible partners', () => {
    const first = card({
      id: 'first',
      name: 'First',
      type: 'Legendary Creature — Human',
      tags: ['Partner']
    });
    const second = card({
      id: 'second',
      name: 'Second',
      type: 'Legendary Creature — Elf',
      tags: ['Partner']
    });
    const background = card({
      id: 'background',
      name: 'Background',
      type: 'Legendary Enchantment — Background'
    });
    const { controls } = selection(createDeck([
      { card: first, quantity: 1 },
      { card: second, quantity: 1 },
      { card: background, quantity: 1 }
    ]));

    expect(controls.commanderCandidates.value.map(item => item.id))
      .toEqual(['first', 'second']);

    controls.selectedCommanderId.value = 'first';
    expect(controls.compatibleSecondCommanders.value.map(item => item.id))
      .toEqual(['second']);
    controls.secondCommanderId.value = 'second';

    expect(controls.selectedCommanders.value.map(item => item.id))
      .toEqual(['first', 'second']);
    expect(controls.getPairingMechanic(first, second)).toBe('Partner');
  });

  it('rejects a second commander without a legal pairing mechanic', () => {
    const first = card({
      id: 'first',
      type: 'Legendary Creature — Human'
    });
    const second = card({
      id: 'second',
      type: 'Legendary Creature — Elf'
    });
    const { activeDeck, controls } = selection(createDeck([
      { card: first, quantity: 1 },
      { card: second, quantity: 1 }
    ]));

    controls.selectedCommanderId.value = first.id;
    controls.secondCommanderId.value = second.id;

    expect(activeDeck.value?.commanderIds).toEqual(['first']);
    expect(controls.compatibleSecondCommanders.value).toEqual([]);
  });

  it('recognizes format-specific Brawl and Pauper Commander eligibility', () => {
    const planeswalker = card({
      id: 'walker',
      name: 'Legendary Walker',
      type: 'Legendary Planeswalker'
    });
    const uncommon = card({
      id: 'uncommon',
      name: 'Uncommon Creature',
      type: 'Creature',
      rarity: 'uncommon'
    });
    const brawl = selection(createDeck([
      { card: planeswalker, quantity: 1 }
    ], 'brawl'));
    const pauper = selection(createDeck([
      { card: uncommon, quantity: 1 }
    ], 'paupercommander'));

    expect(brawl.controls.commanderCandidates.value).toEqual([planeswalker]);
    expect(pauper.controls.commanderCandidates.value).toEqual([uncommon]);
  });

  it('selects only companion candidates present in the deck and clears selection', () => {
    const companion = card({
      id: 'companion',
      tags: ['Companion']
    });
    const { controls, setCompanion, clearCompanion } = selection(createDeck([
      { card: companion, quantity: 1 }
    ]));

    expect(controls.companionCandidates.value).toEqual([companion]);
    controls.selectedCompanionId.value = companion.id;
    expect(setCompanion).toHaveBeenCalledWith(companion);

    controls.selectedCompanionId.value = '';
    expect(clearCompanion).toHaveBeenCalledOnce();
  });

  it('reports copy, legality, and color identity problems for deck entries', () => {
    const leader = card({
      id: 'leader',
      name: 'Leader',
      type: 'Legendary Creature',
      colorIdentity: ['U']
    });
    const illegal = card({
      id: 'illegal',
      name: 'Illegal Card',
      legalities: { commander: 'banned' },
      colorIdentity: ['R']
    });
    const { controls } = selection(createDeck([
      { card: leader, quantity: 1 },
      { card: illegal, quantity: 5 }
    ]));

    controls.selectedCommanderId.value = leader.id;

    expect(controls.getDeckEntryWarnings({
      card: illegal,
      quantity: 5
    })).toEqual([
      'BANNED IN COMMANDER',
      'COPY LIMIT: 4 MAXIMUM',
      'COLOR IDENTITY VIOLATION'
    ]);
    expect(controls.getDeckEntryShortage({
      card: illegal,
      quantity: 5
    })).toBe(3);
  });
});
