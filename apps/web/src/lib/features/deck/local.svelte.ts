// Per-tab screen state that survives moving between screens, as the old global S did: the deck country filters and
// the My calls filters. Not persisted; a reload starts from "All".
import { ALL_CALLS, type CallsFilter, type CountryFilter } from './deck.ts';

export const deckFilter: { place: CountryFilter; area: CountryFilter } = $state({
	place: 'all',
	area: 'all',
});

export const callsFilter: { value: CallsFilter } = $state({ value: { ...ALL_CALLS } });
