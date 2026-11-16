// The six sections of the app (plan section 8), in tab order. `route` is the SvelteKit route id for resolve(): the
// section's first page (Trip opens on the Itinerary, as the old #/itinerary did).
export interface Tab {
	route:
		| '/(app)'
		| '/(app)/trip/itinerary'
		| '/(app)/places'
		| '/(app)/decide'
		| '/(app)/money'
		| '/(app)/prep';
	path: '/' | '/trip' | '/places' | '/decide' | '/money' | '/prep';
	label: string;
}

export const TABS: readonly Tab[] = [
	{ route: '/(app)', path: '/', label: 'Today' },
	{ route: '/(app)/trip/itinerary', path: '/trip', label: 'Trip' },
	{ route: '/(app)/places', path: '/places', label: 'Places' },
	{ route: '/(app)/decide', path: '/decide', label: 'Decide' },
	{ route: '/(app)/money', path: '/money', label: 'Money' },
	{ route: '/(app)/prep', path: '/prep', label: 'Prep' },
];

/** The tab a path belongs to: Today owns `/` and `/today/*`; the others own their prefix. */
export function activeTab(pathname: string): Tab['path'] {
	const match = TABS.find(
		(tab) => tab.path !== '/' && (pathname === tab.path || pathname.startsWith(`${tab.path}/`)),
	);
	return match?.path ?? '/';
}

/** Count badges on the section tabs (old secBadge): Decide is what is left to call, Prep the open tasks. */
export type TabBadges = Partial<Record<Tab['path'], number>>;
