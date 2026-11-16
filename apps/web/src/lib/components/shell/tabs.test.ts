import { expect, test } from 'vitest';
import { activeTab, TABS } from './tabs';

test('six tabs in order', () => {
	expect(TABS.map((t) => t.label)).toEqual(['Today', 'Trip', 'Places', 'Decide', 'Money', 'Prep']);
});

test('active tab by path', () => {
	expect(activeTab('/')).toBe('/');
	expect(activeTab('/today/2026-12-25')).toBe('/');
	expect(activeTab('/trip/itinerary')).toBe('/trip');
	expect(activeTab('/places')).toBe('/places');
	expect(activeTab('/placesx')).toBe('/');
});
