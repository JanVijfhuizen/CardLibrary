export const SCRYFALL_FORMATS = [
  'standard',
  'future',
  'historic',
  'timeless',
  'gladiator',
  'pioneer',
  'explorer',
  'modern',
  'legacy',
  'pauper',
  'vintage',
  'penny',
  'commander',
  'duel',
  'brawl',
  'historicbrawl',
  'standardbrawl',
  'alchemy',
  'oathbreaker',
  'paupercommander',
  'oldschool',
  'premodern',
  'predh'
] as const;

export type ScryfallFormat = typeof SCRYFALL_FORMATS[number];
export type DeckFormat = ScryfallFormat | 'any';

export class MtgCard {
  id: string = '';
  name: string = '';
  type: string = '';
  color: string = '';
  cost: number = 0;
  tags: string[] = [];
  image: string = '';

  colorIdentity?: string[];
  legalities?: Record<string, string>;
  oracleText?: string;
  keywords?: string[];
  rarity?: string;
}

export class DeckEntry {
  card: MtgCard = new MtgCard();
  quantity: number = 1;
}

export class Deck {
  id: string = '';
  name: string = '';
  entries: DeckEntry[] = [];
  updatedAt: string = '';
  collectionOnly: boolean = false;

  format: DeckFormat = 'standard';
  commanderIds: string[] = [];

  // Used by Oathbreaker.
  oathbreakerId?: string;
  signatureSpellId?: string;  
  // Used by Companion.
  companionCard?: MtgCard;
}

export class CollectionEntry {
  card: MtgCard = new MtgCard();
  quantity: number = 1;
}

export class CardFilters {
  query: string = '';
  color: string = '';
  type: string = '';
  minCost: number | null = 0;
  maxCost: number | null = null;
}
