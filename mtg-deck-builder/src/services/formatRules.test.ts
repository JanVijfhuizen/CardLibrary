import { describe, expect, it } from 'vitest';
import type { Deck, DeckFormat, MtgCard } from '../types/mtg';
import {
  canHaveAnyNumber,
  FORMAT_OPTIONS,
  getCardCopyLimit,
  getFormatName,
  isBasicLand,
  validateDeck
} from './formatRules';

function card(overrides: Partial<MtgCard> = {}): MtgCard {
  return {
    id: 'card-1',
    name: 'Test Card',
    type: 'Creature',
    color: 'U',
    cost: 1,
    tags: [],
    image: '',
    colorIdentity: ['U'],
    legalities: {},
    oracleText: '',
    rarity: 'common',
    ...overrides
  };
}

function deck(
  entries: Deck['entries'] = [],
  format: DeckFormat = 'standard',
  overrides: Partial<Deck> = {}
): Deck {
  return {
    id: 'deck-1',
    name: 'Test Deck',
    entries,
    updatedAt: '',
    collectionOnly: false,
    format,
    commanderIds: [],
    ...overrides
  };
}

describe('format helpers', () => {
  it('puts unrestricted and popular formats at the top of the options', () => {
    expect(FORMAT_OPTIONS.slice(0, 5).map(({ value }) => value)).toEqual([
      'any',
      'commander',
      'modern',
      'pioneer',
      'standard'
    ]);
  });

  it('returns a readable name for configured and unrestricted formats', () => {
    expect(getFormatName(undefined)).toBe('Unrestricted');
    expect(getFormatName('any')).toBe('Unrestricted');
    expect(getFormatName('paupercommander')).toBe('Pauper Commander');
  });

  it('recognizes basic lands and cards with unlimited-copy text', () => {
    expect(isBasicLand(card({ type: 'Basic Land — Island' }))).toBe(true);
    expect(isBasicLand(card({ type: 'Land — Island' }))).toBe(false);
    expect(canHaveAnyNumber(card({
      oracleText: 'A deck can have any number of cards named Test Card.'
    }))).toBe(true);
    expect(canHaveAnyNumber(card())).toBe(false);
  });

  it('applies format limits with basic land, unlimited-copy, and restricted-card exceptions', () => {
    expect(getCardCopyLimit(card(), 'standard')).toBe(4);
    expect(getCardCopyLimit(card({ type: 'Basic Land — Island' }), 'standard'))
      .toBe(Number.MAX_SAFE_INTEGER);
    expect(getCardCopyLimit(card({
      oracleText: 'A deck can have any number of cards named Test Card.'
    }), 'commander')).toBe(Number.MAX_SAFE_INTEGER);
    expect(getCardCopyLimit(card({
      legalities: { vintage: 'restricted' }
    }), 'vintage')).toBe(1);
    expect(getCardCopyLimit(card(), 'any')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('validateDeck', () => {
  it('treats an unrestricted deck as legal, even when empty', () => {
    expect(validateDeck(deck([], 'any'))).toEqual({
      status: 'legal',
      issues: [],
      unknownCards: []
    });
  });

  it('reports the minimum-card issue for an undersized deck', () => {
    const result = validateDeck(deck([
      { card: card({ legalities: { standard: 'legal' } }), quantity: 1 }
    ]));

    expect(result.status).toBe('illegal');
    expect(result.issues).toContain(
      'Standard requires at least 60 cards in the main deck. This deck has 1.'
    );
  });

  it('accepts a complete legal standard deck with basic lands at the minimum size', () => {
    const result = validateDeck(deck([
      {
        card: card({
          type: 'Basic Land — Island',
          legalities: { standard: 'legal' }
        }),
        quantity: 60
      }
    ]));

    expect(result.status).toBe('legal');
    expect(result.issues).toEqual([]);
  });

  it('reports banned cards, illegal cards, and copy-limit violations', () => {
    const result = validateDeck(deck([
      { card: card({ id: 'banned', name: 'Banned', legalities: { standard: 'banned' } }), quantity: 1 },
      { card: card({ id: 'illegal', name: 'Illegal', legalities: { standard: 'not_legal' } }), quantity: 1 },
      { card: card({ id: 'copies', legalities: { standard: 'legal' } }), quantity: 5 }
    ]));

    expect(result.issues).toEqual(expect.arrayContaining([
      'Banned is banned in Standard.',
      'Illegal is not legal in Standard.',
      'Test Card exceeds the 4-copy limit.'
    ]));
  });

  it('allows more than four copies of basic lands', () => {
    const result = validateDeck(deck([
      { card: card({
        type: 'Basic Land — Island',
        legalities: { standard: 'legal' }
      }), quantity: 60 }
    ]));

    expect(result.issues).not.toContain('Test Card exceeds the 4-copy limit.');
  });

  it('marks unknown legality as incomplete, and deduplicates unknown names', () => {
    const result = validateDeck(deck([
      {
        card: card({
          id: 'one',
          type: 'Basic Land — Island'
        }),
        quantity: 30
      },
      {
        card: card({
          id: 'two',
          type: 'Basic Land — Island'
        }),
        quantity: 30
      }
    ]));

    expect(result.status).toBe('incomplete');
    expect(result.unknownCards).toEqual(['Test Card']);
  });

  it('checks exact card counts for fixed-size formats', () => {
    const result = validateDeck(deck([], 'brawl'));

    expect(result.issues).toContain(
      'Brawl requires at least 60 cards in the main deck. This deck has 0.'
    );
  });

  it('requires an eligible commander in commander format', () => {
    const result = validateDeck(deck([], 'commander'));

    expect(result.issues).toContain('Select a commander.');
  });

  it('allows compatible partner commanders and rejects non-partner pairs', () => {
    const first = card({
      id: 'first',
      name: 'First',
      type: 'Legendary Creature — Human',
      tags: ['Partner'],
      legalities: { commander: 'legal' }
    });
    const second = card({
      id: 'second',
      name: 'Second',
      type: 'Legendary Creature — Elf',
      tags: ['Partner'],
      legalities: { commander: 'legal' }
    });
    const entry = [
      { card: first, quantity: 1 },
      { card: second, quantity: 1 }
    ];

    expect(validateDeck(deck(entry, 'commander', {
      commanderIds: ['first', 'second']
    })).issues).not.toContain('The selected commander pair is not permitted.');

    expect(validateDeck(deck(entry, 'commander', {
      commanderIds: ['first', 'second']
    })).status).toBe('illegal');

    expect(validateDeck(deck(entry, 'commander', {
      commanderIds: ['first', 'second']
    })).issues).toContain(
      'Commander requires at least 100 cards in the main deck. This deck has 2.'
    );
  });

  it('flags cards outside commander color identity', () => {
    const commander = card({
      id: 'commander',
      type: 'Legendary Creature — Human',
      colorIdentity: ['U'],
      legalities: { commander: 'legal' }
    });
    const offColor = card({
      id: 'off-color',
      name: 'Off-color Card',
      colorIdentity: ['R'],
      legalities: { commander: 'legal' }
    });
    const result = validateDeck(deck([
      { card: commander, quantity: 1 },
      { card: offColor, quantity: 1 }
    ], 'commander', { commanderIds: ['commander'] }));

    expect(result.issues).toContain(
      "Off-color Card is outside the leader's color identity."
    );
  });

  it('requires an Oathbreaker and a signature spell of the right card types', () => {
    const result = validateDeck(deck([], 'oathbreaker'));

    expect(result.issues).toContain('Select an Oathbreaker.');
    expect(result.issues).toContain('Select a Signature Spell.');
  });

  it('excludes a companion from the main-deck count and validates it separately', () => {
    const main = card({
      id: 'main',
      legalities: { standard: 'legal' }
    });
    const companion = card({
      id: 'companion',
      name: 'Companion',
      legalities: { standard: 'not_legal' }
    });
    const result = validateDeck(deck([
      { card: main, quantity: 60 },
      { card: companion, quantity: 1 }
    ], 'standard', { companionCard: companion }));

    expect(result.issues).not.toContain(
      'Standard allows at most 60 cards in the main deck. This deck has 61.'
    );
    expect(result.issues).toContain('Companion is not legal in Standard.');
  });
});
