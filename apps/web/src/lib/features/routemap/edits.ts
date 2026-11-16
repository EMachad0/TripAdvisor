// Unsaved route edits (port of game.js routeEdited, saveLeg, flushRouteSaves and resetLeg). Each edit replaces a
// leg's stops locally at once (the map and the plan redraw), then the whole list for that country is saved after
// a 600 ms pause; a newer edit restarts the pause. The local list is dropped once the latest save has landed (the
// live route.current then carries it). Pure TypeScript with injected effects, so it runs under plain vitest; the
// page wraps it with a rune counter (editor.svelte.ts).
import type { RouteModelLeg, RouteModelStop } from '#lib/content/types.js';
import { stopsPayload } from './model.ts';

export const ROUTE_SAVE_MS = 600;

export type Outcome =
	| { ok: true }
	| { ok: false; reason: 'guest' | 'frozen' | 'invalid' | 'auth' | 'error'; message: string };

export interface EditsDeps {
	save: (country: string, stops: { area: string; nights?: number }[]) => Promise<Outcome>;
	reset: (country: string) => Promise<Outcome>;
	/** Something shown changed (the wrapper bumps its rune). */
	notify: () => void;
	toast: (message: string, kind?: 'error') => void;
	/** The message for a frozen write (write.ts FROZEN_MESSAGE). */
	frozenMessage: string;
	delayMs?: number;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (t: unknown) => void;
}

interface Local {
	name: string;
	stops: RouteModelStop[];
}

export class RouteEdits {
	readonly #deps: EditsDeps;
	readonly #local = new Map<string, Local>();
	readonly #timers = new Map<string, unknown>();
	readonly #seq = new Map<string, number>();

	constructor(deps: EditsDeps) {
		this.#deps = deps;
	}

	/** The legs with local edits laid over them (an edited leg counts as changed in the game). */
	apply(countries: readonly RouteModelLeg[]): RouteModelLeg[] {
		if (this.#local.size === 0) return [...countries];
		return countries.map((c) => {
			const mine = this.#local.get(c.id);
			return mine === undefined ? c : { ...c, stops: mine.stops, source: 'game' };
		});
	}

	/** A leg has an edit not saved yet (waiting, sending, or kept while writes are paused). */
	has(country: string): boolean {
		return this.#local.has(country);
	}

	get pending(): boolean {
		return this.#local.size > 0;
	}

	/** Replace a leg's stops now and save them after the pause. */
	edit(leg: Pick<RouteModelLeg, 'id' | 'name'>, stops: RouteModelStop[]): void {
		this.#local.set(leg.id, { name: leg.name, stops });
		this.#deps.notify();
		this.#clear(leg.id);
		const set = this.#deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
		this.#timers.set(
			leg.id,
			set(() => void this.#save(leg.id), this.#deps.delayMs ?? ROUTE_SAVE_MS),
		);
	}

	/** Save every waiting leg now (leaving the page, closing the editor). */
	flush(): void {
		for (const id of [...this.#timers.keys()]) {
			this.#clear(id);
			void this.#save(id);
		}
	}

	/** Put a leg back to its config seed; any waiting edit of it is dropped. */
	async reset(leg: Pick<RouteModelLeg, 'id' | 'name'>): Promise<void> {
		this.#clear(leg.id);
		this.#seq.set(leg.id, (this.#seq.get(leg.id) ?? 0) + 1);
		this.#local.delete(leg.id);
		this.#deps.notify();
		const out = await this.#deps.reset(leg.id);
		if (out.ok) this.#deps.toast(`${leg.name}: back to the plan`);
		else
			this.#deps.toast(
				out.reason === 'frozen' ? this.#deps.frozenMessage : `Couldn’t reset: ${out.message}`,
				'error',
			);
	}

	#clear(id: string): void {
		const t = this.#timers.get(id);
		if (t === undefined) return;
		const clear =
			this.#deps.clearTimer ??
			((x: unknown): void => {
				clearTimeout(x as ReturnType<typeof setTimeout>);
			});
		clear(t);
		this.#timers.delete(id);
	}

	async #save(id: string): Promise<void> {
		this.#timers.delete(id);
		const mine = this.#local.get(id);
		if (mine === undefined) return;
		const seq = (this.#seq.get(id) ?? 0) + 1;
		this.#seq.set(id, seq);
		const out = await this.#deps.save(id, stopsPayload(mine.stops));
		const latest = this.#seq.get(id) === seq && !this.#timers.has(id);
		if (out.ok) {
			if (latest && this.#local.get(id) === mine) {
				this.#local.delete(id);
				this.#deps.notify();
			}
			return;
		}
		if (out.reason === 'frozen') {
			// The write stays in the outbox and retries; keep showing it.
			this.#deps.toast(this.#deps.frozenMessage, 'error');
			return;
		}
		this.#deps.toast(`Couldn’t save the ${mine.name} route: ${out.message}`, 'error');
		if (latest && this.#local.get(id) === mine) {
			// Show what the server has again instead of an edit that did not land.
			this.#local.delete(id);
			this.#deps.notify();
		}
	}
}
