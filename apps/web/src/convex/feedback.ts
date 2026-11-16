// Feedback: the traveler's swipes and notes, and the derived state the decide screens read (plan section 5,
// replacing GET /api/state's feedback half, POST /api/swipe and POST /api/note).
import { computeRatings, type Rating } from '@atr/shared/elo';
import {
	latestNotes,
	latestVerdicts,
	normalizeNoteText,
	sortedDuels,
	unseenKeys,
	type Verdicts,
} from '@atr/shared/feedback';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { memberQuery, ownerMutation } from './lib/access';
import { invalid } from './lib/errors';
import { eventsInFileOrder, inFileOrder } from './lib/rows';
import {
	findCard,
	firstSeenRows,
	patchGameState,
	readGameState,
	requireContentIndex,
} from './lib/state';
import { round, verdict } from './tables/validators';

export const MAX_NOTE_LENGTH = 2000;
export const MAX_MS = 3_600_000;
export const MAX_SEEN_KEYS = 5000;

export interface FeedbackState {
	verdicts: Verdicts;
	/** Current note text per round and id (cleared notes left out), trimmed. */
	notes: { area: Record<string, string>; place: Record<string, string> };
	/** Every duel, oldest first. */
	duels: { winner: string; loser: string }[];
	/** Game Elo per place (seeded from verdicts, K=32). */
	ratings: Record<string, Rating>;
	local: { days: Record<string, number>; locks: Record<string, string> };
	firstRun: string | null;
	/** First-seen time per key (place id or `area:<id>`); a card is new when its time is after firstRun. */
	firstSeen: Record<string, string>;
}

/** Everything the decide screens derive from feedback, computed like GET /api/state did. */
export const state = memberQuery({
	args: {},
	handler: async (ctx): Promise<FeedbackState> => {
		const [swipes, duelRows, noteRows, game, seen] = await Promise.all([
			eventsInFileOrder(ctx.db, 'swipes'),
			eventsInFileOrder(ctx.db, 'duels'),
			eventsInFileOrder(ctx.db, 'notes'),
			readGameState(ctx.db),
			firstSeenRows(ctx.db),
		]);
		const verdicts = latestVerdicts(swipes);
		const duels = sortedDuels(duelRows).map((d) => ({ winner: d.winner, loser: d.loser }));
		const notes: FeedbackState['notes'] = { area: {}, place: {} };
		for (const n of latestNotes(noteRows).values()) notes[n.round][n.id] = n.text.trim();
		return {
			verdicts,
			notes,
			duels,
			ratings: Object.fromEntries(computeRatings(verdicts.place, duels)),
			local: { days: game.days, locks: game.locks },
			firstRun: game.firstRun,
			firstSeen: Object.fromEntries(seen.map((s) => [s.key, s.ts])),
		};
	},
});

/**
 * First-seen bookkeeping, called by the owner's client after load (the old GET /api/state wrote it on read).
 * The first call sets firstRun; keys not seen before get this write's ts. Keys that are not a known place id or
 * `area:<id>` are ignored. Guests never call it (ownerMutation refuses them).
 */
export const trackSeen = ownerMutation({
	args: { keys: v.array(v.string()) },
	handler: async (ctx, { keys }) => {
		if (keys.length > MAX_SEEN_KEYS) {
			throw invalid(`at most ${String(MAX_SEEN_KEYS)} keys per call`);
		}
		const index = await requireContentIndex(ctx.db);
		const known = new Set([
			...index.places.map((p) => p.id),
			...index.areas.map((a) => `area:${a.id}`),
		]);
		const game = await readGameState(ctx.db);
		const seen = new Set((await firstSeenRows(ctx.db)).map((s) => s.key));
		const added = unseenKeys(
			seen,
			keys.filter((k) => known.has(k)),
		);
		let firstRun = game.firstRun;
		if (firstRun === null) {
			firstRun = ctx.ts;
			await patchGameState(ctx.db, { firstRun });
		}
		for (const key of added) await ctx.db.insert('firstSeen', { key, ts: ctx.ts });
		return { changed: added.length > 0 || game.firstRun === null, added: added.length, firstRun };
	},
});

type SwipeEvent = Omit<Doc<'swipes'>, '_id' | '_creationTime' | 'userId'>;

/** One verdict on a card (POST /api/swipe). Country comes from the content index, never from the client. */
export const swipe = ownerMutation({
	args: { round, id: v.string(), verdict, ms: v.optional(v.number()) },
	handler: async (ctx, args): Promise<{ ok: true; event: SwipeEvent }> => {
		const index = await requireContentIndex(ctx.db);
		const card = findCard(index, args.round, args.id);
		if (card === undefined) throw invalid(`unknown ${args.round} id "${args.id}"`);
		// The old rule: a whole, non-negative ms is kept (clamped to an hour); anything else is dropped.
		const ms =
			args.ms !== undefined && Number.isInteger(args.ms) && args.ms >= 0
				? Math.min(args.ms, MAX_MS)
				: undefined;
		const event: SwipeEvent = {
			v: 1,
			ts: ctx.ts,
			session: ctx.session,
			round: args.round,
			id: card.id,
			verdict: args.verdict,
			country: card.country,
			...(ms === undefined ? {} : { ms }),
		};
		await ctx.db.insert('swipes', { ...event, userId: ctx.member.authUserId });
		return { ok: true, event };
	},
});

type NoteEvent = Omit<Doc<'notes'>, '_id' | '_creationTime' | 'userId'>;

/**
 * The one editable note on a card (POST /api/note). Text is CRLF-normalized and trimmed, "" clears it, and a
 * save equal to the current note writes nothing (`unchanged`), so autosave never floods the log.
 */
export const note = ownerMutation({
	args: { round, id: v.string(), text: v.string() },
	handler: async (
		ctx,
		args,
	): Promise<{ ok: true; unchanged: boolean; note: string | null; event?: NoteEvent }> => {
		const index = await requireContentIndex(ctx.db);
		const card = findCard(index, args.round, args.id);
		if (card === undefined) throw invalid(`unknown ${args.round} id "${args.id}"`);
		const text = normalizeNoteText(args.text);
		if (text.length > MAX_NOTE_LENGTH) {
			throw invalid(
				`invalid notes event: text: is ${String(text.length)} characters, too long (max ${String(MAX_NOTE_LENGTH)})`,
			);
		}
		const current = await ctx.db
			.query('notes')
			.withIndex('by_round_id_ts', (q) => q.eq('round', args.round).eq('id', card.id))
			.order('desc')
			.take(50);
		const latest = latestOf(current);
		if ((latest?.text.trim() ?? '') === text) {
			return { ok: true, unchanged: true, note: text === '' ? null : text };
		}
		const event: NoteEvent = {
			v: 1,
			ts: ctx.ts,
			session: ctx.session,
			round: args.round,
			id: card.id,
			text,
			country: card.country,
		};
		await ctx.db.insert('notes', { ...event, userId: ctx.member.authUserId });
		return { ok: true, unchanged: false, note: text === '' ? null : text, event };
	},
});

/**
 * The latest note among rows read newest-ts first: among rows sharing the newest ts, the last in file order
 * wins (latestNotes keeps file order for ties).
 */
function latestOf(rowsNewestFirst: readonly Doc<'notes'>[]): Doc<'notes'> | undefined {
	const top = rowsNewestFirst[0];
	if (top === undefined) return undefined;
	const tied = rowsNewestFirst.filter((r) => r.ts === top.ts);
	return latestNotes(inFileOrder(tied), { keepCleared: true }).get(`${top.round}:${top.id}`);
}
