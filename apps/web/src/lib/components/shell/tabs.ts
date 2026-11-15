// The six sections of the app (plan section 8), in tab order. `route` is the SvelteKit route id for resolve().
export interface Tab {
	route:
		'/(app)' | '/(app)/trip' | '/(app)/places' | '/(app)/decide' | '/(app)/money' | '/(app)/prep';
	path: '/' | '/trip' | '/places' | '/decide' | '/money' | '/prep';
	label: string;
}

export const TABS: readonly Tab[] = [
	{ route: '/(app)', path: '/', label: 'Today' },
	{ route: '/(app)/trip', path: '/trip', label: 'Trip' },
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
