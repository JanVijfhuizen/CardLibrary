# CardLibrary

A Vue 3 and TypeScript app for building Magic: The Gathering decks and managing
an owned-card collection. Decks and collection entries are stored in browser
local storage; card search and decklist resolution use the Scryfall API.

## Development

```sh
npm install
npm run dev
```

Create a production build with `npm run build`.

## Tests

Run the unit suite with:

```sh
npm test
```

The Vitest suite covers deck rules and state, browser storage, Scryfall search
and decklist resolution, card selection, grid settings, and import behavior.

## Structure

- `src/components/` contains the app screens and focused builder UI components.
- `src/composables/` contains reusable deck, catalog, selection, and UI state.
- `src/services/` contains storage, Scryfall integration, and format rules.
- `src/types/` contains shared card, deck, and filter types.
