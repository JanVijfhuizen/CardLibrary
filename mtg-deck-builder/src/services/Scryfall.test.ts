import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MtgCard } from '../types/mtg';
import { resolveDecklist, useScryfallAPI } from './Scryfall';

function apiCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    name: 'Sol Ring',
    type_line: 'Artifact',
    colors: [],
    cmc: 1,
    keywords: [],
    image_uris: { normal: 'sol-ring.jpg' },
    color_identity: [],
    legalities: { commander: 'legal' },
    oracle_text: 'Add {C}{C}.',
    rarity: 'uncommon',
    ...overrides
  };
}

function response(data: Record<string, unknown>, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  } as Response;
}

describe('Scryfall search', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds a quoted search query from card filters and maps card data', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: [apiCard()],
      has_more: false
    }));

    const api = useScryfallAPI();
    await api.searchCards({
      query: ' Sol Ring ',
      color: 'C',
      type: 'Artifact',
      minCost: 1,
      maxCost: 3
    });

    const [url] = vi.mocked(fetch).mock.calls[0];
    const parsedUrl = new URL(String(url));
    const query = decodeURIComponent(parsedUrl.searchParams.get('q') ?? '');

    expect(query).toBe(
      'game:paper name:"Sol Ring" c:c t:artifact cmc>=1 cmc<=3'
    );
    expect(api.cards.value).toEqual([{
      id: 'card-1',
      name: 'Sol Ring',
      type: 'Artifact',
      color: 'Colorless',
      cost: 1,
      tags: [],
      image: 'sol-ring.jpg',
      colorIdentity: [],
      legalities: { commander: 'legal' },
      oracleText: 'Add {C}{C}.',
      rarity: 'uncommon'
    }]);
    expect(api.isLoading.value).toBe(false);
  });

  it('escapes quotes and slashes in the card-name search', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ data: [] }));

    await useScryfallAPI().searchCards({
      query: 'a "quoted" \\ name',
      color: '',
      type: '',
      minCost: 0,
      maxCost: null
    });

    const parsedUrl = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(decodeURIComponent(parsedUrl.searchParams.get('q') ?? ''))
      .toBe('game:paper name:"a \\"quoted\\" \\\\ name"');
  });

  it('uses a face image and oracle text for double-faced cards', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: [apiCard({
        oracle_text: undefined,
        image_uris: undefined,
        card_faces: [{
          oracle_text: 'Front text.',
          image_uris: { normal: 'front.jpg' }
        }, {
          oracle_text: 'Back text.'
        }]
      })]
    }));

    await useScryfallAPI().searchCards();

    expect(useScryfallAPI().cards.value[0]).toMatchObject({
      image: 'front.jpg',
      oracleText: 'Front text.\nBack text.'
    });
  });

  it('omits image-less results', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: [apiCard({ image_uris: undefined })]
    }));

    const api = useScryfallAPI();
    await api.searchCards();

    expect(api.cards.value).toEqual([]);
  });

  it('treats a Scryfall 404 as an empty result without an error', async () => {
    vi.mocked(fetch).mockResolvedValue(response({}, 404));

    const api = useScryfallAPI();
    await api.searchCards();

    expect(api.cards.value).toEqual([]);
    expect(api.error.value).toBeNull();
    expect(api.isLoading.value).toBe(false);
  });

  it('exposes HTTP failures in the search error state', async () => {
    vi.mocked(fetch).mockResolvedValue(response({}, 503));

    const api = useScryfallAPI();
    await api.searchCards();

    expect(api.error.value).toBe('Scryfall API error (503)');
    expect(api.isLoading.value).toBe(false);
  });

  it('loads additional pages while skipping duplicate card IDs', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({
        data: [apiCard()],
        has_more: true,
        next_page: 'https://api.scryfall.com/page/2'
      }))
      .mockResolvedValueOnce(response({
        data: [
          apiCard({ name: 'Duplicate card' }),
          apiCard({ id: 'card-2', name: 'Island' })
        ],
        has_more: false
      }));

    const api = useScryfallAPI();
    await api.searchCards();
    await api.loadMore();

    expect(api.cards.value.map((card: MtgCard) => card.id))
      .toEqual(['card-1', 'card-2']);
    expect(api.hasMore.value).toBe(false);
    expect(api.isLoadingMore.value).toBe(false);
    expect(fetch).toHaveBeenLastCalledWith(
      'https://api.scryfall.com/page/2',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});

describe('resolveDecklist', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores comments and section headings, combines duplicates, and resolves roles', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: [
        apiCard(),
        apiCard({ id: 'commander', name: 'Atraxa, Praetors’ Voice' }),
        apiCard({ id: 'companion', name: 'Lurrus of the Dream-Den' })
      ],
      not_found: [{ name: 'Missing Card' }]
    }));

    const result = await resolveDecklist([
      '# Deck list',
      'Deck',
      '// Commented out card',
      '2x Sol Ring (CMM) 396',
      '3 Sol Ring',
      'Commander: Atraxa, Praetors’ Voice',
      'Companion: Lurrus of the Dream-Den',
      '1 Missing Card',
      '0 Ignore Me'
    ].join('\n'));

    expect(result.entries.map(({ card, quantity }) => [card.name, quantity]))
      .toEqual([
        ['Sol Ring', 5],
        ['Atraxa, Praetors’ Voice', 1],
        ['Lurrus of the Dream-Den', 1]
      ]);
    expect(result.commanderNames).toEqual(['Atraxa, Praetors’ Voice']);
    expect(result.companionName).toBe('Lurrus of the Dream-Den');
    expect(result.notFound).toEqual(['Missing Card']);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  });

  it('batches more than 75 unique card names into separate requests', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: [], not_found: [] }))
      .mockResolvedValueOnce(response({ data: [], not_found: [] }));

    const lines = Array.from({ length: 76 }, (_, index) => `1 Card ${index + 1}`);
    const result = await resolveDecklist(lines.join('\n'));

    expect(result.entries).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).identifiers)
      .toHaveLength(75);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).identifiers)
      .toHaveLength(1);
  });

  it('throws on API failures instead of returning a successful empty resolution', async () => {
    vi.mocked(fetch).mockResolvedValue(response({}, 500));

    await expect(resolveDecklist('1 Sol Ring'))
      .rejects.toThrow('Scryfall API error (500)');
  });
});
