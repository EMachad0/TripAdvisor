// Holidays the board asks about (port of the HOLIDAYS table in game/lib/board.js).
import { lookup } from '../util.ts';

/** Lunar New Year's Day moves every year (21 Jan – 20 Feb). One line per year; this is the only place the date lives. */
export const LUNAR_NEW_YEAR: Readonly<Record<number, string>> = { 2027: '2027-02-06' };

/**
 * A holiday is a fixed month-day (`md`) or a list of full dates (`dates`, for one that moves).
 * `before` / `after`: days around the date that still count (the eve, the public-holiday days after).
 * pick 'one' (default): rival options across cities for one night, so duel them and lock one.
 * pick 'many': the city is fixed and the options fall on different days, so they don't compete:
 *   no lock, no duel; each option keeps its own Must / Maybe / Skip call.
 */
export interface Holiday {
	readonly id: string;
	readonly tag: string;
	readonly md?: string;
	readonly dates?: readonly string[];
	readonly before?: number;
	readonly after?: number;
	readonly pick?: 'one' | 'many';
	readonly title: string;
	readonly short: string;
	readonly emoji: string;
}

export const HOLIDAYS: Readonly<Record<'christmas' | 'nye' | 'lny', Holiday>> = {
	christmas: {
		id: 'christmas',
		tag: 'christmas',
		md: '12-25',
		title: 'Where for Christmas?',
		short: 'Christmas',
		emoji: '🎄',
	},
	nye: {
		id: 'nye',
		tag: 'nye',
		md: '12-31',
		title: "Where for New Year's Eve?",
		short: "New Year's Eve",
		emoji: '🎆',
	},
	lny: {
		id: 'lny',
		tag: 'lunar-new-year-option',
		dates: Object.values(LUNAR_NEW_YEAR),
		before: 1,
		after: 2,
		pick: 'many',
		title: 'What to do for Lunar New Year?',
		short: 'Lunar New Year',
		emoji: '🧧',
	},
};

/** The holiday with this id, or undefined. */
export const holidayOf = (holidayId: unknown): Holiday | undefined => lookup(HOLIDAYS, holidayId);

/** True for a holiday whose options do not compete (no lock, no duel). */
export const picksMany = (holidayId: unknown): boolean => holidayOf(holidayId)?.pick === 'many';
