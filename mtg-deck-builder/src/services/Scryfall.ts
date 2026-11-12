
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
  const faces = Array.isArray(card.card_faces) ? card.card_faces : [];

  const oracleText =
    card.oracle_text ||
    faces.map((face: any) => face.oracle_text || '').join('\n');

  const image =
    card.image_uris?.normal ||
    faces.find((face: any) => face.image_uris?.normal)?.image_uris?.normal ||
    '';

  return {
    id: card.id,
    name: card.name,
    type: card.type_line || 'Unknown',
    color: parseColor(card.colors),
    cost: Number(card.cmc ?? 0),
    tags: card.keywords || [],
    image,
    colorIdentity: card.color_identity || [],
    legalities: card.legalities || {},
    oracleText,
    rarity: card.rarity || ''
  };
}

function parseColor(colors: string[] | undefined): string {
  if (!colors || colors.length === 0) return 'Colorless';
  return colors.join('');
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

  if (filters?.color) {
    parts.push(
      filters.color === 'C'
        ? 'c:c'
        : `c=${filters.color.toLowerCase()}`
    );
  }

  if (filters?.type) {
    parts.push(`t:${filters.type.toLowerCase()}`);
  }

  const minCost = Number(filters?.minCost);

  if (
    filters?.minCost !== null &&
    filters?.minCost !== undefined &&
    Number.isFinite(minCost) &&
    minCost > 0
  ) {
    parts.push(`cmc>=${minCost}`);
  }

  const maxCost = Number(filters?.maxCost);

  if (
    filters?.maxCost !== null &&
    filters?.maxCost !== undefined &&
    Number.isFinite(maxCost) &&
    maxCost >= 0
  ) {
    parts.push(`cmc<=${maxCost}`);
  }

  return parts.join(' ');
}

export interface ResolvedDecklistEntry {
  card: MtgCard;
  quantity: number;
}

export interface DecklistResolution {
  entries: ResolvedDecklistEntry[];
  commanderNames: string[];
  companionName: string | null;
  notFound: string[];
}

interface ParsedDecklistLine {
  name: string;
  quantity: number;
  role: 'main' | 'commander' | 'companion';
}

function parseDecklist(text: string): ParsedDecklistLine[] {
  const result: ParsedDecklistLine[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();

    if (!line || line.startsWith('//') || line.startsWith('#')) {
      continue;
    }

    const lower = line.toLowerCase();

    if (
      ['deck', 'mainboard', 'sideboard', 'creatures',
       'instants', 'sorceries', 'artifacts', 'enchantments',
       'lands', 'planeswalkers'].includes(lower.replace(/:$/, ''))
    ) {
      continue;
    }

    let role: ParsedDecklistLine['role'] = 'main';

    if (/^commander\s*:/i.test(line)) {
      role = 'commander';
      line = line.replace(/^commander\s*:\s*/i, '');
    } else if (/^companion\s*:/i.test(line)) {
      role = 'companion';
      line = line.replace(/^companion\s*:\s*/i, '');
    }

    let quantity = 1;

    const quantityMatch = line.match(/^(\d+)\s*x?\s+(.+)$/i);

    if (quantityMatch) {
      quantity = Number(quantityMatch[1]);
      line = quantityMatch[2].trim();
    }

    if (quantity <= 0 || !Number.isInteger(quantity)) continue;

    // Remove common set-code and collector-number suffixes.
    line = line.replace(/\s+\([A-Z0-9]+\)\s+\S+$/, '').trim();

    if (!line) continue;

    result.push({ name: line, quantity, role });
  }

  return result;
}

export async function resolveDecklist(
  text: string
): Promise<DecklistResolution> {
  const parsed = parseDecklist(text);

  const uniqueNames = [
    ...new Set(parsed.map((line) => line.name))
  ];

  const resolvedCards = new Map<string, MtgCard>();
  const notFound: string[] = [];

  for (let i = 0; i < uniqueNames.length; i += 75) {
    const batch = uniqueNames.slice(i, i + 75);

    const response = await fetch(
      'https://api.scryfall.com/cards/collection',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          identifiers: batch.map((name) => ({ name }))
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Scryfall API error (${response.status})`);
    }

    const data = await response.json();

    for (const card of data.data ?? []) {
      resolvedCards.set(card.name.toLowerCase(), parseCard(card));
    }

    for (const missing of data.not_found ?? []) {
      if (missing.name) notFound.push(missing.name);
    }
  }

  const entries: ResolvedDecklistEntry[] = [];
  const commanderNames: string[] = [];
  let companionName: string | null = null;

  for (const line of parsed) {
    const card = resolvedCards.get(line.name.toLowerCase());

    if (!card) continue;

    if (line.role === 'commander') {
      commanderNames.push(card.name);
    } else if (line.role === 'companion') {
      companionName = card.name;
    }

    const existing = entries.find(
      (entry) => entry.card.id === card.id
    );

    if (existing) {
      existing.quantity += line.quantity;
    } else {
      entries.push({
        card,
        quantity: line.quantity
      });
    }
  }

  return {
    entries,
    commanderNames,
    companionName,
    notFound
  };
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

      if (response.status === 404) return;

      if (!response.ok) {
        throw new Error(`Scryfall API error (${response.status})`);
      }

      const data = await response.json();

      if (currentRequest !== requestId) return;

      cards.value = Array.isArray(data.data)
        ? data.data.map(parseCard).filter((card: MtgCard) => card.image)
        : [];

      hasMore.value = Boolean(data.has_more);
      nextPageUrl = data.next_page || null;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;

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
    if (!nextPageUrl || isLoading.value || isLoadingMore.value) return;

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
        ? data.data.map(parseCard).filter((card: MtgCard) => card.image)
        : [];

      const existingIds = new Set(cards.value.map(card => card.id));

      cards.value.push(
        ...newCards.filter(card => !existingIds.has(card.id))
      );

      hasMore.value = Boolean(data.has_more);
      nextPageUrl = data.next_page || null;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;

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
