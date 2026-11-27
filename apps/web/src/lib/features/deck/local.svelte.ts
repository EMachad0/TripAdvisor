// Per-tab screen state that survives moving between screens, as the old global S did: the deck country filters and
// the My calls filters. Not persisted; a reload starts from "All". The deck order (cards put off for later, the card
// picked from the list) is kept in this browser's localStorage, so a put-off card stays at the back after a reload.
import type { Round } from '#lib/features/cards/model.js';
import { ALL_CALLS, type CallsFilter, type CountryFilter, type DeckOrder } from './deck.ts';

export const deckFilter: { place: CountryFilter; area: CountryFilter } = $state({
	place: 'all',
	area: 'all',
});

export const callsFilter: { value: CallsFilter } = $state({ value: { ...ALL_CALLS } });

const ORDER_KEY = 'atr-deck-order';
const isOrder = (x: unknown): x is DeckOrder =>
	typeof x === 'object' &&
	x !== null &&
	'first' in x &&
	(x.first === null || typeof x.first === 'string') &&
	'later' in x &&
	Array.isArray(x.later) &&
	x.later.every((id) => typeof id === 'string');

export const deckOrder: Record<Round, DeckOrder> = $state({
	place: { first: null, later: [] },
	area: { first: null, later: [] },
});

/** Read the saved deck order (call once the page is in the browser). */
export function loadDeckOrder(): void {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null');
		if (typeof saved !== 'object' || saved === null) return;
		if ('place' in saved && isOrder(saved.place)) deckOrder.place = saved.place;
		if ('area' in saved && isOrder(saved.area)) deckOrder.area = saved.area;
	} catch {
		// no storage (private window) or a broken value: start from the plain deck order
	}
}

/** Set a round's deck order and save it. */
export function setDeckOrder(round: Round, order: DeckOrder): void {
	deckOrder[round] = order;
	try {
		localStorage.setItem(ORDER_KEY, JSON.stringify(deckOrder));
	} catch {
		// not saved: the order still holds until the tab closes
	}
}
