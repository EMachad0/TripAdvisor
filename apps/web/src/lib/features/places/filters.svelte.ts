// The Places and Answers filters, kept for the whole visit as the old client kept T.places and S.answersFilter in
// memory: leaving the page and coming back finds the same search, city, kind and choice. Not kept across reloads.
import type { Show } from '@atr/shared/trip';

export interface PlacesFilterState {
	/** The search text as typed. */
	q: string;
	/** City ids; null = Everywhere. */
	city: string[] | null;
	cat: string | null;
	show: Show;
	/** The `/places/<cities>` path last applied, so a link sets the city once and the select can change it after. */
	arg: string | undefined;
	/** The first visit has picked its start city (today's stay), or the traveler has chosen one. */
	touched: boolean;
}

export const placesFilter: PlacesFilterState = $state({
	q: '',
	city: null,
	cat: null,
	show: 'all',
	arg: undefined,
	touched: false,
});

export const answersFilter: { id: string } = $state({ id: 'all' });
