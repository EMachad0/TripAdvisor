// The DOM of the map's markers, filled from data: a pin (a <button> Leaflet places in a divIcon), a stack of pins
// too close to tell apart, and a pin's permanent label (drawn in its own pane under every pin, so a label never
// covers a pin). Styled by CityMap.svelte (.cm-pin, .cm-stack, .cm-tags, data-tone, data-cat); text goes in with
// textContent, so nothing a curator wrote becomes markup.
import type { HubKind } from '#lib/content/types.js';
import type { MapPin } from './pins.ts';

const SVG = (paths: string): string =>
	`<svg class="cm-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** Lucide plane, train-front, bus and ship (ISC licence), as markup Leaflet can hold. */
const HUB_ICON: Readonly<Record<HubKind, string>> = {
	airport: SVG(
		'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
	),
	station: SVG(
		'<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>',
	),
	bus: SVG(
		'<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
	),
	ferry: SVG(
		'<path d="M12 10.189V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76"/><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
	),
};

const CHECK = SVG('<path d="M20 6 9 17l-5-5"/>').replace('stroke-width="2"', 'stroke-width="4"');

/** Fill (or refill) a pin's button from its data. */
export function pinHtml(el: HTMLButtonElement, pin: MapPin): void {
	el.className = 'cm-pin';
	el.setAttribute('aria-label', pin.label);
	el.dataset['pin'] = pin.key;
	el.dataset['tone'] = pin.tone;
	el.dataset['z'] = String(pin.z);
	if (pin.cat !== '') el.dataset['cat'] = pin.cat;
	else delete el.dataset['cat'];
	el.replaceChildren();
	if (pin.hubKind !== null) {
		el.insertAdjacentHTML('beforeend', HUB_ICON[pin.hubKind]);
	} else {
		const e = document.createElement('span');
		e.className = 'cm-emoji';
		e.setAttribute('aria-hidden', 'true');
		e.textContent = pin.emoji;
		el.append(e);
	}
	if (pin.tone === 'booked') {
		const c = document.createElement('span');
		c.className = 'cm-check';
		c.setAttribute('aria-hidden', 'true');
		c.innerHTML = CHECK;
		el.append(c);
	}
}

/** A stack's button: the count, and (beside a booked stay) a "+". */
export function stackHtml(el: HTMLButtonElement, n: number, label: string, beside: boolean): void {
	el.className = 'cm-stack';
	el.setAttribute('aria-label', label);
	el.dataset['stack'] = String(n);
	if (beside) el.dataset['beside'] = '';
	else delete el.dataset['beside'];
	el.textContent = beside ? `+${String(n)}` : String(n);
}

/** A pin's permanent label lines (a booked stay's name and dates, a hub's short name and Arrive / Leave days). */
export function labelHtml(el: HTMLElement, pin: Pick<MapPin, 'tags' | 'tone'>): void {
	el.className = 'cm-label';
	el.dataset['tone'] = pin.tone;
	el.setAttribute('aria-hidden', 'true');
	const box = document.createElement('span');
	box.className = 'cm-tags';
	for (const t of pin.tags) {
		const s = document.createElement('span');
		s.className = 'cm-tag';
		s.textContent = t;
		box.append(s);
	}
	el.replaceChildren(box);
}
