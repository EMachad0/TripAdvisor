// The city map's filter choices the traveler made, per city (`country/city`). A city opens with its derived
// defaults (model.ts defaultFilter); once a toggle is flipped, that choice sticks for the visit and is remembered in
// this browser (localStorage, when it works). Browser only: nothing writes here during SSR.
import type { CityChoices } from './model.ts';

const STORE = 'atr-citymap-filters';

type Choices = CityChoices;

function load(): Record<string, Choices> {
	try {
		if (typeof localStorage === 'undefined') return {};
		const raw = localStorage.getItem(STORE);
		const v: unknown = raw === null ? null : JSON.parse(raw);
		return typeof v === 'object' && v !== null && !Array.isArray(v)
			? (v as Record<string, Choices>)
			: {};
	} catch {
		return {};
	}
}

export const cityChoices: Record<string, Choices> = $state(load());

/** Remember a choice for one city. */
export function choose(key: string, patch: Choices): void {
	cityChoices[key] = { ...cityChoices[key], ...patch };
	try {
		localStorage.setItem(STORE, JSON.stringify(cityChoices));
	} catch {
		// private mode or storage full: the choice still holds for this visit
	}
}
