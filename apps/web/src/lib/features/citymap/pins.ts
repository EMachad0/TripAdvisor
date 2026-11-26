// What the city map draws, as data the Leaflet layer turns into markers (CityMap.svelte). Built by the page from the
// model; plain objects so a change is a cheap comparison.
import type { HubKind } from '#lib/content/types.js';
import type { LatLng, PinTone } from './model.ts';

export interface MapPin {
	/** `place:<id>`, `stay:<leg id>` (a booked stay without a card) or `hub:<id>`. */
	key: string;
	kind: 'place' | 'booked' | 'hub';
	at: LatLng;
	/** The name alone (a stack lists the names of its pins). */
	name: string;
	/** The accessible name. */
	label: string;
	/** A place: its category emoji. */
	emoji: string;
	/** A place: its category id (the accent via data-cat). */
	cat: string;
	/** A place pin's emphasis; a hub is 'hub', or 'hub-used' when the trip goes through it. */
	tone: PinTone | 'hub' | 'hub-used';
	hubKind: HubKind | null;
	/** Permanent label lines (a booked stay's name and dates, a hub's Arrive / Leave tags). */
	tags: string[];
	/** Hover tooltip (desktop): name · category · price. */
	tip: string;
	z: number;
	visible: boolean;
}

/** An in / out hub drawn as an edge chip while it is outside the view. */
export interface EdgeTarget {
	key: string;
	at: LatLng;
	/** "✈ PVG 31 km": the arrow is added by the map. */
	text: string;
	/** "Shanghai Pudong International Airport, 31 km": the chip's accessible name says "Show … on the map". */
	name: string;
}

/** The small card a hub or a booked stay without a card opens on the map. */
export interface MapPopup {
	key: string;
	title: string;
	local: string | null;
	lines: string[];
}
