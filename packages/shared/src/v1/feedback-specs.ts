// The v1 feedback line specs (port of FEEDBACK_SPECS in platform/lib/feedback/index.js).
// Field order is the order the old writer puts keys in (game/lib/store.js), which the serialiser reuses.
import { ROUTE_STOPS_SPEC } from '../route.ts';
import { t, type ObjectSpec } from '../schema/dsl.ts';
import { COUNTRY_IDS } from '../schema/enums.ts';

const ts = t.string({
	desc: 'ISO 8601 timestamp',
	example: '2026-11-20T14:03:00Z',
	pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
	patternHint: 'ISO 8601 like 2026-11-20T14:03:00Z',
});

export const FEEDBACK_KINDS = ['swipes', 'duels', 'questions', 'notes', 'route'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_SPECS: Readonly<Record<FeedbackKind, ObjectSpec>> = {
	swipes: t.object({
		v: t.enum([1]),
		ts,
		session: t.string({ max: 80, example: 's-2026-11-20-a' }),
		round: t.enum(['area', 'place']),
		id: t.slug({ desc: 'Place or area id', example: 'yu-garden' }),
		verdict: t.enum(['must', 'maybe', 'skip']),
		country: t.opt(t.enum(COUNTRY_IDS)),
		ms: t.opt(t.int({ min: 0, desc: 'Time spent on the card' })),
	}),
	duels: t.object({
		v: t.enum([1]),
		ts,
		session: t.opt(t.string({ max: 80 })),
		winner: t.slug(),
		loser: t.slug(),
		country: t.opt(t.enum(COUNTRY_IDS)),
		elo: t.opt(t.object({ winner: t.number(), loser: t.number() })),
	}),
	questions: t.object({
		v: t.enum([1]),
		ts,
		session: t.opt(t.string({ max: 80 })),
		id: t.slug({ desc: 'Place id the question was about' }),
		question: t.string({ max: 2000 }),
		answer_summary: t.opt(t.string({ max: 2000 })),
	}),
	// The traveler's own note on a card. One editable note per (round, id): the latest line wins; "" clears it.
	notes: t.object({
		v: t.enum([1]),
		ts,
		session: t.opt(t.string({ max: 80 })),
		round: t.enum(['area', 'place']),
		id: t.slug({ desc: 'Place or area id', example: 'harbin' }),
		text: t.string({
			max: 2000,
			allowEmpty: true,
			desc: 'The note; an empty string clears it',
			example: 'Must, but only if I go in January.',
		}),
		country: t.opt(t.enum(COUNTRY_IDS)),
	}),
	// The traveler's route inside one country leg: the whole ordered list of stops, every save.
	// The latest line per country wins; the seed is `route:` in config/trip.yaml.
	route: t.object({
		v: t.enum([1]),
		ts,
		session: t.opt(t.string({ max: 80 })),
		country: t.enum(COUNTRY_IDS),
		stops: ROUTE_STOPS_SPEC,
	}),
};

/** The JSONL file of each kind, in feedback/. */
export const feedbackFile = (kind: FeedbackKind): string => `${kind}.jsonl`;
