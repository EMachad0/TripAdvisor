// v1 feedback records: one parsed line of feedback/<kind>.jsonl, with its x_ fields moved into `extra`.
// The shapes mirror the event tables in apps/web/src/convex/tables/feedback.ts (minus seq and userId, which
// only the new app has and which are never exported).
import type { RouteStop } from '../route.ts';
import type { CountryId } from '../schema/enums.ts';
import type { FeedbackKind } from './feedback-specs.ts';
import type { Extra } from './json.ts';

export type Round = 'area' | 'place';
export type Verdict = 'must' | 'maybe' | 'skip';

interface EventBase {
	v: 1;
	/** ISO 8601, second precision, exactly as written. */
	ts: string;
	extra?: Extra;
}

export interface SwipeRecord extends EventBase {
	session: string;
	round: Round;
	id: string;
	verdict: Verdict;
	country?: CountryId;
	ms?: number;
}

export interface DuelRecord extends EventBase {
	session?: string;
	winner: string;
	loser: string;
	country?: CountryId;
	/** Pre-duel game ratings, rounded to 0.1. */
	elo?: { winner: number; loser: number };
}

export interface QuestionRecord extends EventBase {
	session?: string;
	id: string;
	question: string;
	answer_summary?: string;
}

export interface NoteRecord extends EventBase {
	session?: string;
	round: Round;
	id: string;
	/** "" clears the note. */
	text: string;
	country?: CountryId;
}

export interface RouteRecord extends EventBase {
	session?: string;
	country: CountryId;
	stops: RouteStop[];
}

export interface FeedbackRecords {
	swipes: SwipeRecord;
	duels: DuelRecord;
	questions: QuestionRecord;
	notes: NoteRecord;
	route: RouteRecord;
}

export type FeedbackRecord<K extends FeedbackKind = FeedbackKind> = FeedbackRecords[K];
