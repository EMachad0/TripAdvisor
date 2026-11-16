// The route editor for the page: RouteEdits wired to write.ts (route.save and route.reset) and sonner, with a rune
// counter so derived values re-read the local edits whenever they change.
import { toast } from 'svelte-sonner';
import { COUNTRY_IDS } from '@atr/shared/schema/enums';
import type { RouteModelLeg } from '#lib/content/types.js';
import { FROZEN_MESSAGE, write, type WriteOutcome } from '#lib/sync/write.js';
import { RouteEdits, type Outcome } from './edits.ts';

type CountryId = (typeof COUNTRY_IDS)[number];
const isCountry = (id: string): id is CountryId => (COUNTRY_IDS as readonly string[]).includes(id);

const outcome = (o: WriteOutcome<'route.save'> | WriteOutcome<'route.reset'>): Outcome =>
	o.ok ? { ok: true } : { ok: false, reason: o.reason, message: o.message };

const unknownCountry = (id: string): Outcome => ({
	ok: false,
	reason: 'invalid',
	message: `unknown country "${id}"`,
});

export class RouteEditor {
	#version = $state(0);
	readonly edits = new RouteEdits({
		save: async (country, stops) =>
			isCountry(country)
				? outcome(await write('route.save', { country, stops }, { quiet: true }))
				: unknownCountry(country),
		reset: async (country) =>
			isCountry(country)
				? outcome(await write('route.reset', { country }, { quiet: true }))
				: unknownCountry(country),
		notify: () => {
			this.#version++;
		},
		toast: (message, kind) => {
			if (kind === 'error') toast.error(message);
			else toast(message);
		},
		frozenMessage: FROZEN_MESSAGE,
	});

	/** The legs with unsaved edits laid over them (reactive). */
	apply(countries: readonly RouteModelLeg[]): RouteModelLeg[] {
		// #version < 0 never holds: reading it makes callers re-run whenever the local edits change
		if (this.#version < 0) return [...countries];
		return this.edits.apply(countries);
	}
}
