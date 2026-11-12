
import type { Deck, DeckFormat, MtgCard } from '../types/mtg';

export type DeckStatus = 'legal' | 'illegal' | 'incomplete';

export interface DeckValidation {
  status: DeckStatus;
  issues: string[];
  unknownCards: string[];
}

interface FormatRule {
  name: string;
  minCards: number;
  maxCards?: number;
  copyLimit: number;
  singleton?: boolean;
  commander?: 'creature' | 'brawl' | 'uncommon-creature';
  colorIdentity?: boolean;
  oathbreaker?: boolean;
}

export const FORMAT_RULES: Record<Exclude<DeckFormat, 'any'>, FormatRule> = {
  standard: { name: 'Standard', minCards: 60, copyLimit: 4 },
  future: { name: 'Future Standard', minCards: 60, copyLimit: 4 },
  historic: { name: 'Historic', minCards: 60, copyLimit: 4 },
  timeless: { name: 'Timeless', minCards: 60, copyLimit: 4 },
  gladiator: {
    name: 'Gladiator',
    minCards: 100,
    maxCards: 100,
    copyLimit: 1,
    singleton: true
  },
  pioneer: { name: 'Pioneer', minCards: 60, copyLimit: 4 },
  explorer: { name: 'Explorer', minCards: 60, copyLimit: 4 },
  modern: { name: 'Modern', minCards: 60, copyLimit: 4 },
  legacy: { name: 'Legacy', minCards: 60, copyLimit: 4 },
  pauper: { name: 'Pauper', minCards: 60, copyLimit: 4 },
  vintage: { name: 'Vintage', minCards: 60, copyLimit: 4 },
  penny: { name: 'Penny Dreadful', minCards: 60, copyLimit: 4 },
  commander: {
    name: 'Commander',
    minCards: 100,
    maxCards: 100,
    copyLimit: 1,
    singleton: true,
    commander: 'creature',
    colorIdentity: true
  },
  duel: {
    name: 'Duel Commander',
    minCards: 100,
    maxCards: 100,
    copyLimit: 1,
    singleton: true,
    commander: 'creature',
    colorIdentity: true
  },
  brawl: {
    name: 'Brawl',
    minCards: 60,
    maxCards: 60,
    copyLimit: 1,
    singleton: true,
    commander: 'brawl',
    colorIdentity: true
  },
  historicbrawl: {
    name: 'Historic Brawl',
    minCards: 100,
    maxCards: 100,
    copyLimit: 1,
    singleton: true,
    commander: 'brawl',
    colorIdentity: true
  },
  standardbrawl: {
    name: 'Standard Brawl',
    minCards: 60,
    maxCards: 60,
    copyLimit: 1,
    singleton: true,
    commander: 'brawl',
    colorIdentity: true
  },
  alchemy: { name: 'Alchemy', minCards: 60, copyLimit: 4 },
  oathbreaker: {
    name: 'Oathbreaker',
    minCards: 60,
    maxCards: 60,
    copyLimit: 1,
    singleton: true,
    colorIdentity: true,
    oathbreaker: true
  },
  paupercommander: {
    name: 'Pauper Commander',
    minCards: 100,
    maxCards: 100,
    copyLimit: 1,
    singleton: true,
    commander: 'uncommon-creature',
    colorIdentity: true
  },
  oldschool: { name: 'Old School', minCards: 60, copyLimit: 4 },
  premodern: { name: 'Premodern', minCards: 60, copyLimit: 4 },
  predh: {
    name: 'PreDH',
    minCards: 100,
    maxCards: 100,
    copyLimit: 1,
    singleton: true,
    commander: 'creature',
    colorIdentity: true
  }
};

const POPULAR_FORMAT_ORDER: DeckFormat[] = [
  'any',
  'commander',
  'modern',
  'pioneer',
  'standard'
];

const allFormatOptions = Object.entries(FORMAT_RULES).map(
  ([value, rule]) => {
    const format = value as DeckFormat;

    return {
      value: format,
      label: rule.name,
      featured: false,
      popular: POPULAR_FORMAT_ORDER.includes(format)
    };
  }
);

const unrestrictedOption = {
  value: 'any' as DeckFormat,
  label: 'Unrestricted',
  featured: false,
  popular: true
};

export const FORMAT_OPTIONS = [
  unrestrictedOption,
  ...POPULAR_FORMAT_ORDER
    .filter(format => format !== 'any')
    .map(format =>
      allFormatOptions.find(option => option.value === format)!
    ),
  ...allFormatOptions
    .filter(option => !POPULAR_FORMAT_ORDER.includes(option.value))
    .sort((a, b) => a.label.localeCompare(b.label))
];

export function getFormatName(format: DeckFormat | undefined): string {
  if (!format || format === 'any') return 'Unrestricted';
  return FORMAT_RULES[format]?.name ?? format;
}

export function isBasicLand(card: MtgCard): boolean {
  return /\bBasic\b/i.test(card.type);
}

export function canHaveAnyNumber(card: MtgCard): boolean {
  return /a deck can have any number of cards named/i.test(
    card.oracleText ?? ''
  );
}

export function getCardCopyLimit(
  card: MtgCard,
  format: DeckFormat
): number {
  if (
    format === 'any' ||
    isBasicLand(card) ||
    canHaveAnyNumber(card)
  ) {
    return Number.MAX_SAFE_INTEGER;
  }

  const rule = FORMAT_RULES[format];

  if (!rule) return 4;

  if (
    format === 'vintage' &&
    card.legalities?.[format] === 'restricted'
  ) {
    return 1;
  }

  return rule.copyLimit;
}

export function isCommanderFormat(format: DeckFormat): boolean {
  return format !== 'any' &&
    Boolean(FORMAT_RULES[format]?.commander);
}

function isBackground(card: MtgCard): boolean {
  return /legendary enchantment.*background/i.test(card.type);
}

function isCommanderEligible(
  card: MtgCard,
  mode: FormatRule['commander']
): boolean {
  const type = card.type.toLowerCase();
  const oracle = (card.oracleText ?? '').toLowerCase();

  if (mode === 'brawl') {
    return (
      (type.includes('legendary') && type.includes('creature')) ||
      (type.includes('legendary') && type.includes('planeswalker')) ||
      oracle.includes('can be your commander')
    );
  }

  if (mode === 'uncommon-creature') {
    return (
      type.includes('creature') &&
      card.rarity === 'uncommon'
    );
  }

  if (isBackground(card)) return false;

  return (
    oracle.includes('can be your commander') ||
    (type.includes('legendary') && type.includes('creature'))
  );
}

function hasKeyword(card: MtgCard, keyword: string): boolean {
  return (card.tags ?? []).some(
    item => item.toLowerCase() === keyword.toLowerCase()
  );
}

function hasPartnerWith(
  card: MtgCard,
  other: MtgCard
): boolean {
  const match = (card.oracleText ?? '').match(
    /partner with ([^(.\n]+)/i
  );

  return Boolean(
    match &&
    match[1].trim().toLowerCase() === other.name.toLowerCase()
  );
}

function canPairCommanders(
  first: MtgCard,
  second: MtgCard
): boolean {
  if (first.id === second.id) return false;

  if (
    (hasKeyword(first, 'Partner') &&
      hasKeyword(second, 'Partner')) ||
    (hasKeyword(first, 'Friends forever') &&
      hasKeyword(second, 'Friends forever')) ||
    hasPartnerWith(first, second) ||
    hasPartnerWith(second, first)
  ) {
    return true;
  }

  if (
    (hasKeyword(first, 'Choose a Background') &&
      isBackground(second)) ||
    (hasKeyword(second, 'Choose a Background') &&
      isBackground(first))
  ) {
    return true;
  }

  const firstDoctor = /time lord.*doctor|doctor.*time lord/i.test(
    first.type
  );

  const secondDoctor = /time lord.*doctor|doctor.*time lord/i.test(
    second.type
  );

  return (
    (hasKeyword(first, "Doctor's companion") && secondDoctor) ||
    (hasKeyword(second, "Doctor's companion") && firstDoctor)
  );
}

function selectedCards(
  deck: Deck,
  ids: string[]
): MtgCard[] {
  return ids
    .map(id =>
      deck.entries.find(entry => entry.card.id === id)?.card
    )
    .filter((card): card is MtgCard => Boolean(card));
}

function identityViolation(
  card: MtgCard,
  leaders: MtgCard[]
): boolean {
  if (!leaders.length) return false;

  const identity = new Set(
    leaders.flatMap(leader => leader.colorIdentity ?? [])
  );

  return (card.colorIdentity ?? []).some(
    color => !identity.has(color)
  );
}

function totalCopiesByName(
  deck: Deck,
  name: string
): number {
  return deck.entries
    .filter(
      entry => entry.card.name.toLowerCase() === name.toLowerCase()
    )
    .reduce((total, entry) => total + entry.quantity, 0);
}

export function validateDeck(deck: Deck): DeckValidation {
  const format = deck.format ?? 'any';
  const issues: string[] = [];
  const unknownCards: string[] = [];

  if (format === 'any') {
    return {
      status: 'legal',
      issues,
      unknownCards
    };
  }

  const rule = FORMAT_RULES[format];

  if (!rule) {
    return {
      status: 'incomplete',
      issues: [`No construction rules are configured for ${format}.`],
      unknownCards
    };
  }

  // The companion is stored in entries but is outside the main deck.
  const totalCards = deck.entries.reduce(
    (sum, entry) => sum + entry.quantity,
    0
  );

  const companionQuantity = deck.companionCard ? 1 : 0;
  const mainDeckCards = totalCards - companionQuantity;

  const mainDeckEntries = deck.entries.filter(
    entry => entry.card.id !== deck.companionCard?.id
  );

  if (mainDeckCards < rule.minCards) {
    issues.push(
      `${rule.name} requires at least ${rule.minCards} cards in the main deck. This deck has ${mainDeckCards}.`
    );
  }

  if (
    rule.maxCards !== undefined &&
    mainDeckCards > rule.maxCards
  ) {
    issues.push(
      `${rule.name} allows at most ${rule.maxCards} cards in the main deck. This deck has ${mainDeckCards}.`
    );
  }

  let leaders: MtgCard[] = [];

  if (rule.commander) {
    const ids = deck.commanderIds ?? [];
    leaders = selectedCards(deck, ids);

    if (ids.length === 0) {
      issues.push('Select a commander.');
    } else if (leaders.length !== ids.length) {
      issues.push('A selected commander is not present in the deck.');
    } else if (ids.length > 2) {
      issues.push('A deck cannot have more than two commanders.');
    } else if (!isCommanderEligible(leaders[0], rule.commander)) {
      issues.push('The selected commander is not eligible for this format.');
    } else if (ids.length === 2) {
      if (
        rule.commander !== 'creature' ||
        !isCommanderEligible(leaders[1], rule.commander) ||
        !canPairCommanders(leaders[0], leaders[1])
      ) {
        issues.push('The selected commander pair is not permitted.');
      }
    }
  }

  if (rule.oathbreaker) {
    const oathbreaker = selectedCards(
      deck,
      deck.oathbreakerId ? [deck.oathbreakerId] : []
    );

    const spell = selectedCards(
      deck,
      deck.signatureSpellId ? [deck.signatureSpellId] : []
    );

    if (!oathbreaker.length) {
      issues.push('Select an Oathbreaker.');
    } else if (
      !oathbreaker[0].type.toLowerCase().includes('planeswalker')
    ) {
      issues.push('Your Oathbreaker must be a planeswalker.');
    }

    if (!spell.length) {
      issues.push('Select a Signature Spell.');
    } else if (!/\b(instant|sorcery)\b/i.test(spell[0].type)) {
      issues.push('Your Signature Spell must be an instant or sorcery.');
    }

    leaders = oathbreaker;
  }

  // Color identity applies to every card, including the companion.
  if (rule.colorIdentity && leaders.length) {
    for (const entry of deck.entries) {
      if (identityViolation(entry.card, leaders)) {
        issues.push(
          `${entry.card.name} is outside the leader's color identity.`
        );
      }
    }
  }

  // Validate the main deck's legality and copy limits.
  for (const entry of mainDeckEntries) {
    const legality = entry.card.legalities?.[format] ?? 'unknown';

    if (legality === 'banned') {
      issues.push(`${entry.card.name} is banned in ${rule.name}.`);
    } else if (legality === 'not_legal') {
      issues.push(`${entry.card.name} is not legal in ${rule.name}.`);
    } else if (legality === 'unknown') {
      unknownCards.push(entry.card.name);
    }

    const limit = getCardCopyLimit(entry.card, format);
    const copies = totalCopiesByName(deck, entry.card.name);

    if (copies > limit) {
      issues.push(
        `${entry.card.name} exceeds the ${limit}-copy limit.`
      );
    }
  }

  // Validate the companion separately, without counting it in the main deck.
  if (deck.companionCard) {
    const companion = deck.companionCard;
    const legality = companion.legalities?.[format] ?? 'unknown';

    if (legality === 'banned') {
      issues.push(`${companion.name} is banned in ${rule.name}.`);
    } else if (legality === 'not_legal') {
      issues.push(`${companion.name} is not legal in ${rule.name}.`);
    } else if (legality === 'unknown') {
      unknownCards.push(companion.name);
    }

    if (rule.colorIdentity && identityViolation(companion, leaders)) {
      issues.push(
        `${companion.name} is outside the leader's color identity.`
      );
    }

    const companionLimit = getCardCopyLimit(companion, format);

    if (companionLimit < 1) {
      issues.push(
        `${companion.name} cannot be included in this format.`
      );
    }
  }

  if (format === 'oathbreaker') {
    const spellEntry = deck.entries.find(
      entry => entry.card.id === deck.signatureSpellId
    );

    if (spellEntry && spellEntry.quantity !== 1) {
      issues.push('Your Signature Spell must have exactly one copy.');
    }
  }

  const uniqueUnknown = [...new Set(unknownCards)];

  return {
    status: issues.length
      ? 'illegal'
      : uniqueUnknown.length
        ? 'incomplete'
        : 'legal',
    issues,
    unknownCards: uniqueUnknown
  };
}
