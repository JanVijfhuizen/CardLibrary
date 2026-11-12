
import { ref } from 'vue';
import type { MtgCard, CardFilters } from '../types/mtg';

const cards = ref<MtgCard[]>([]);
const isLoading = ref(false);
const isLoadingMore = ref(false);
const error = ref<string | null>(null);
const hasMore = ref(false);

let nextPageUrl: string | null = null;
let activeController: AbortController | null = null;
let requestId = 0;

function parseCard(card: any): MtgCard {
  return {
    id: card.id,
    name: card.name,
    type: card.type_line || 'Unknown',
    color: parseColor(card.colors),
    cost: Number(card.cmc ?? 0),
    tags: card.keywords || [],
    image:
      card.image_uris?.normal ||
      card.card_faces?.[0]?.image_uris?.normal ||
      ''
  };
}

function parseColor(colors: string[] | undefined): string {
  if (!colors || colors.length === 0) {
    return 'Colorless';
  }

  if (colors.length > 1) {
    return 'Multicolor';
  }

  const map: Record<string, string> = {
    W: 'White',
    U: 'Blue',
    B: 'Black',
    R: 'Red',
    G: 'Green'
  };

  return map[colors[0]] || 'Colorless';
}

function buildQuery(filters?: CardFilters): string {
  const parts = ['game:paper'];

  const searchTerm = filters?.query?.trim();

  if (searchTerm) {
    const escapedName = searchTerm
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');

    parts.push(`name:"${escapedName}"`);
  }

  // Exact color identity
  if (filters?.color) {
    if (filters.color === 'C') {
      parts.push('c:c');
    } else {
      parts.push(`c=${filters.color.toLowerCase()}`);
    }
  }

  // Card type
  if (filters?.type) {
    parts.push(`t:${filters.type.toLowerCase()}`);
  }

  // Minimum mana value
  const minCost = Number(filters?.minCost);

  if (
    filters?.minCost !== null &&
    filters?.minCost !== undefined &&
    Number.isFinite(minCost) &&
    minCost > 0
  ) {
    parts.push(`cmc>=${minCost}`);
  }

  // Maximum mana value
  const maxCost = Number(filters?.maxCost);

  if (
    filters?.maxCost !== null &&
    filters?.maxCost !== undefined &&
    filters?.maxCost !== '' as any &&
    Number.isFinite(maxCost) &&
    maxCost >= 0
  ) {
    parts.push(`cmc<=${maxCost}`);
  }

  return parts.join(' ');
}

export function useScryfallAPI() {
  const searchCards = async (filters?: CardFilters) => {
    activeController?.abort();

    const controller = new AbortController();
    activeController = controller;

    const currentRequest = ++requestId;

    cards.value = [];
    error.value = null;
    hasMore.value = false;
    nextPageUrl = null;
    isLoading.value = true;
    isLoadingMore.value = false;

    try {
      const query = buildQuery(filters);

      const url =
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=name`;

      const response = await fetch(url, {
        signal: controller.signal
      });

      if (currentRequest !== requestId) return;

      if (response.status === 404) {
        cards.value = [];
        hasMore.value = false;
        nextPageUrl = null;
        return;
      }

      if (!response.ok) {
        throw new Error(`Scryfall API error (${response.status})`);
      }

      const data = await response.json();

      if (currentRequest !== requestId) return;

      cards.value = Array.isArray(data.data)
        ? data.data
            .map(parseCard)
            .filter((card: MtgCard) => card.image)
        : [];

      hasMore.value = Boolean(data.has_more);
      nextPageUrl = data.next_page || null;

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      if (currentRequest === requestId) {
        error.value =
          err instanceof Error
            ? err.message
            : 'Failed to load cards from Scryfall.';

        console.error('Scryfall search failed:', err);
      }

    } finally {
      if (currentRequest === requestId) {
        isLoading.value = false;
      }
    }
  };

  const loadMore = async () => {
    if (
      !nextPageUrl ||
      isLoading.value ||
      isLoadingMore.value
    ) {
      return;
    }

    const controller = new AbortController();

    activeController?.abort();
    activeController = controller;

    const currentRequest = ++requestId;
    isLoadingMore.value = true;

    try {
      const response = await fetch(nextPageUrl, {
        signal: controller.signal
      });

      if (currentRequest !== requestId) return;

      if (!response.ok) {
        throw new Error(`Scryfall API error (${response.status})`);
      }

      const data = await response.json();

      if (currentRequest !== requestId) return;

      const newCards: MtgCard[] = Array.isArray(data.data)
        ? data.data
            .map(parseCard)
            .filter((card: MtgCard) => card.image)
        : [];

      const existingIds = new Set(
        cards.value.map(card => card.id)
      );

      cards.value.push(
        ...newCards.filter(card => !existingIds.has(card.id))
      );

      hasMore.value = Boolean(data.has_more);
      nextPageUrl = data.next_page || null;

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      if (currentRequest === requestId) {
        error.value =
          err instanceof Error
            ? err.message
            : 'Failed to load more cards.';

        console.error('Failed to load more cards:', err);
      }

    } finally {
      if (currentRequest === requestId) {
        isLoadingMore.value = false;
      }
    }
  };

  return {
    cards,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    searchCards,
    loadMore
  };
}
