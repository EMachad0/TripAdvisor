// Trip → Map → a city (/trip/map/<country>/<city>): only cities with a located place card or an airport / station
// have a map; anything else is the app's normal 404.
import { error } from '@sveltejs/kit';
import { mapCities, cityKey } from '#lib/features/citymap/model.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
	const { content } = await parent();
	if (!mapCities(content.places, content.hubs).has(cityKey(params.country, params.city)))
		error(404, 'Not found');
	return { country: params.country, city: params.city };
};
