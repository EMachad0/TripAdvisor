// The live data every Decide screen derives from the app data: calls (local undo applied), duels, ratings, the
// joined places, the saved days and locks, and the counts behind the badges. Create it in a component's script.
import type { Rating } from '@atr/shared/elo';
import { getAppData, type AppData } from '#lib/content/app-data.svelte.js';
import { verdictsOf } from '#lib/features/cards/calls.svelte.js';
import type { VerdictMap } from '#lib/features/cards/model.js';
import {
	counts,
	decidePlaces,
	indexById,
	mergeDays,
	ratingsOf,
	type Counts,
	type DecidePlace,
	type Duel,
	type Locks,
} from './model.ts';
import { daysDraft } from './state.svelte.ts';

const NO_NOTES = { area: {}, place: {} };

export class DecideData {
	readonly app: AppData = getAppData();
	readonly verdicts: VerdictMap = $derived(verdictsOf(this.app.feedback));
	readonly duels: readonly Duel[] = $derived(this.app.feedback?.duels ?? []);
	readonly notes: {
		area: Readonly<Record<string, string>>;
		place: Readonly<Record<string, string>>;
	} = $derived(this.app.feedback?.notes ?? NO_NOTES);
	readonly ratings: Map<string, Rating> = $derived(ratingsOf(this.verdicts, this.duels));
	readonly places: DecidePlace[] = $derived(
		decidePlaces(this.app.content.places, this.verdicts, this.ratings, this.notes.place),
	);
	readonly byId: ReadonlyMap<string, DecidePlace> = $derived(indexById(this.places));
	readonly locks: Locks = $derived(this.app.feedback?.local.locks ?? {});
	/** Saved day overrides with the unsent ones on top. */
	readonly days: Record<string, number> = $derived(
		mergeDays(this.app.feedback?.local.days ?? {}, daysDraft),
	);
	readonly counts: Counts = $derived(
		counts(
			this.places,
			this.app.content.areas,
			this.verdicts,
			this.duels,
			this.locks,
			this.ratings,
			this.notes,
		),
	);
	readonly isGuest: boolean = $derived(this.app.isGuest);
	/** feedback.state has loaded (the controls work only after that). */
	readonly ready: boolean = $derived(this.app.feedback !== undefined);

	country = (id: string): { flag: string; name: string } => {
		const c = this.app.content.countries.find((x) => x.id === id);
		return { flag: c?.flag ?? '', name: c?.name ?? id };
	};

	category = (id: string): { label: string; icon: string } =>
		this.app.content.categories[id] ?? { label: id, icon: '' };
}
