// The Trip tab opens on the Itinerary, as the old #/itinerary was the section's first page.
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
	redirect(307, resolve('/(app)/trip/itinerary'));
};
