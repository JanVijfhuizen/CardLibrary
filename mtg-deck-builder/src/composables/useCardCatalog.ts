import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useScryfallAPI } from '../services/Scryfall';
import type { ScryfallCardData } from '../services/Scryfall';
import { StorageService } from '../services/Storage';
import { getCardCopyLimit } from '../services/formatRules';
import type {
  CardFilters,
  CollectionEntry,
  Deck,
  DeckFormat,
  MtgCard
} from '../types/mtg';

interface CollectionResponse {
  data?: ScryfallCardData[];
}

const EMPTY_FILTERS: CardFilters = {
  query: '',
  color: '',
  type: '',
  minCost: 0,
  maxCost: null
};

function normalizeColor(color: string): string {
  const letters = (color || '')
    .toLowerCase()
    .replace(/white/g, 'W')
    .replace(/blue/g, 'U')
    .replace(/black/g, 'B')
    .replace(/red/g, 'R')
    .replace(/green/g, 'G')
    .toUpperCase()
    .replace(/[^WUBRG]/g, '');

  return [...new Set(letters)].sort().join('');
}

interface CardCatalogOptions {
  activeDeck: Ref<Deck | null>;
  currentFormat: ComputedRef<DeckFormat>;
  collectionOnly: ComputedRef<boolean>;
  getAvailableQuantity: (cardId: string) => number;
}

export function useCardCatalog({
  activeDeck,
  currentFormat,
  collectionOnly,
  getAvailableQuantity
}: CardCatalogOptions) {
  const {
    cards,
    searchCards,
    loadMore,
    hasMore,
    isLoading,
    isLoadingMore,
    error
  } = useScryfallAPI();

  const filters = ref<CardFilters>({ ...EMPTY_FILTERS });
  const collectionEntries = ref<CollectionEntry[]>([]);

  const loadCollection = () => {
    collectionEntries.value = StorageService.getCollection();
  };

  const refreshCollectionLegality = async () => {
    if (collectionEntries.value.length === 0) return;

    const uniqueIds = [
      ...new Set(
        collectionEntries.value
          .map(entry => entry.card.id)
          .filter(Boolean)
      )
    ];
    const refreshedCards = new Map<string, ScryfallCardData>();

    try {
      for (let index = 0; index < uniqueIds.length; index += 75) {
        const batch = uniqueIds.slice(index, index + 75);
        const response = await fetch(
          'https://api.scryfall.com/cards/collection',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              identifiers: batch.map(id => ({ id }))
            })
          }
        );

        if (!response.ok) {
          throw new Error(`Scryfall API error (${response.status})`);
        }

        const data = await response.json() as CollectionResponse;

        for (const card of data.data ?? []) {
          refreshedCards.set(card.id, card);
        }
      }

      const updateCard = (card: MtgCard): MtgCard => {
        const freshCard = refreshedCards.get(card.id);
        if (!freshCard) return card;

        return {
          ...card,
          legalities: freshCard.legalities ?? card.legalities ?? {},
          colorIdentity:
            freshCard.color_identity ?? card.colorIdentity ?? [],
          oracleText:
            freshCard.oracle_text ?? card.oracleText ?? '',
          tags: freshCard.keywords ?? card.tags ?? []
        };
      };

      collectionEntries.value = collectionEntries.value.map(entry => ({
        ...entry,
        card: updateCard(entry.card)
      }));

      activeDeck.value?.entries.forEach(entry => {
        entry.card = updateCard(entry.card);
      });
    } catch (error: unknown) {
      console.error('Could not refresh collection legality:', error);
    }
  };

  const getFormatLegality = (card: MtgCard): string => {
    if (currentFormat.value === 'any') return 'legal';
    return card.legalities?.[currentFormat.value] ?? 'unknown';
  };

  const getFormatWarning = (card: MtgCard): string => {
    const legality = getFormatLegality(card);
    if (legality === 'banned') return 'BANNED!';
    if (legality === 'not_legal') return 'ILLEGAL!';
    return '';
  };

  const getDeckCopyLimit = (card: MtgCard): number => {
    return getCardCopyLimit(card, currentFormat.value);
  };

  const matchesLocalFilters = (card: MtgCard): boolean => {
    const query = filters.value.query.trim().toLowerCase();
    if (query && !card.name.toLowerCase().includes(query)) return false;

    if (filters.value.color) {
      const color = normalizeColor(card.color);

      if (filters.value.color === 'C') {
        if (color !== '') return false;
      } else if (color !== [...filters.value.color].sort().join('')) {
        return false;
      }
    }

    if (
      filters.value.type &&
      !card.type.toLowerCase().includes(filters.value.type.toLowerCase())
    ) {
      return false;
    }

    if (filters.value.minCost !== null && card.cost < filters.value.minCost) {
      return false;
    }

    if (filters.value.maxCost !== null && card.cost > filters.value.maxCost) {
      return false;
    }

    return true;
  };

  const displayedCards = computed(() => {
    const sourceCards = collectionOnly.value
      ? collectionEntries.value.map(entry => entry.card)
      : cards.value;

    return sourceCards.filter(card => {
      const legality = getFormatLegality(card);
      if (legality === 'banned' || legality === 'not_legal') return false;

      if (collectionOnly.value) {
        const alreadyInDeck = activeDeck.value?.entries.some(
          entry => entry.card.id === card.id
        ) ?? false;

        if (getAvailableQuantity(card.id) <= 0 && !alreadyInDeck) {
          return false;
        }
      }

      return matchesLocalFilters(card);
    });
  });

  const clearFilters = () => {
    filters.value = { ...EMPTY_FILTERS };
  };

  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  onMounted(async () => {
    loadCollection();

    if (collectionOnly.value) {
      await refreshCollectionLegality();
    } else {
      await searchCards(filters.value);
    }
  });

  watch(collectionOnly, async enabled => {
    if (!enabled) return;
    loadCollection();
    await refreshCollectionLegality();
  });

  watch(
    filters,
    newFilters => {
      if (searchTimeout) clearTimeout(searchTimeout);
      if (collectionOnly.value) return;

      searchTimeout = setTimeout(() => {
        void searchCards({ ...newFilters });
      }, 350);
    },
    { deep: true }
  );

  onUnmounted(() => {
    if (searchTimeout) clearTimeout(searchTimeout);
  });

  return {
    cards,
    filters,
    displayedCards,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    getFormatLegality,
    getFormatWarning,
    getDeckCopyLimit,
    loadMore,
    clearFilters
  };
}
