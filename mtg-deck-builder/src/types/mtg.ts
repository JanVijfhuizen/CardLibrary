
export class MtgCard {
  id: string = '';
  name: string = '';
  type: string = '';
  color: string = '';
  cost: number = 0;
  tags: string[] = [];
  image: string = '';
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
}

export class CardFilters {
  query: string = '';
  color: string = '';
  type: string = '';
  minCost: number | null = 0;
  maxCost: number | null = null;
}
