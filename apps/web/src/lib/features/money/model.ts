// The Money screen's view model (port of game/public/trip.js viewMoney, verdictHtml and currentBudget). Pure: the
// maths is @atr/shared's (moneyTotals, dailyOf, priceCheck, RATES), the wording is the old page's.
import {
	dailyOf,
	dayKey,
	hereOn,
	legsSorted,
	moneyTotals,
	priceCheck,
	RATES,
	weekday,
} from '@atr/shared/trip';
import type { Leg, MoneyTotals } from '@atr/shared/trip';
import type { ContentCountry } from '#lib/content/types.js';
import { num, sortedByOrder, str, type TripData, type TripDoc } from './trip-docs.ts';

export const CURRENCIES: readonly string[] = Object.keys(RATES);

export type SpendCategory = 'bed' | 'food' | 'other';
export const CATEGORIES: readonly SpendCategory[] = ['bed', 'food', 'other'];
export const CAT_LABEL: Readonly<Record<SpendCategory, string>> = {
	bed: 'Bed',
	food: 'Food',
	other: 'Other',
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "R$ 1.234" (rounded, pt-BR grouping), like the old fmtR. */
export function fmtR(n: unknown): string {
	return `R$ ${Math.round(Number(n) || 0).toLocaleString('pt-BR')}`;
}

/** "Sun 6 Dec" for a day or stamp; '' when there is none. */
export function fmtDay(s: string | null | undefined): string {
	const k = dayKey(s);
	if (k === '') return '';
	return `${WD[weekday(k)] ?? ''} ${String(Number(k.slice(8, 10)))} ${MON[Number(k.slice(5, 7)) - 1] ?? ''}`;
}

/** "6 Dec" for a day or stamp; '' when there is none. */
export function fmtShort(s: string | null | undefined): string {
	const k = dayKey(s);
	if (k === '') return '';
	return `${String(Number(k.slice(8, 10)))} ${MON[Number(k.slice(5, 7)) - 1] ?? ''}`;
}

/** "1 day", "3 days". */
export const plural = (n: number, w: string, ws = `${w}s`): string =>
	`${String(n)} ${n === 1 ? w : ws}`;

/** A local amount as the old page wrote it ("1.500,5"). */
export const fmtLocal = (n: unknown): string => (Number(n) || 0).toLocaleString('pt-BR');

/** Country name for an id: Brazil is not a trip country but appears in forms and the log. */
export function countryName(countries: readonly ContentCountry[], id: string): string {
	if (id === 'brazil') return 'Brazil';
	if (id === '') return '';
	return countries.find((c) => c.id === id)?.name ?? id;
}

export function countryFlag(countries: readonly ContentCountry[], id: string): string {
	return countries.find((c) => c.id === id)?.flag ?? '';
}

/** A budget row joined with its country's days from the trip config (one source for the dates). */
export interface BudgetRow {
	id: string;
	country: string;
	name: string;
	flag: string;
	currency: string;
	pay: string;
	bed: number;
	food: number;
	other: number;
	days: number;
}

export function budgetRows(trip: TripData, countries: readonly ContentCountry[]): BudgetRow[] {
	return sortedByOrder(trip.budget).map((b) => {
		const country = str(b, 'country');
		const fromConfig = countries.find((c) => c.id === country)?.days;
		return {
			id: b.id,
			country,
			name: countryName(countries, country),
			flag: countryFlag(countries, country),
			currency: str(b, 'currency'),
			pay: str(b, 'pay'),
			bed: num(b, 'bed'),
			food: num(b, 'food'),
			other: num(b, 'other'),
			days: fromConfig ?? num(b, 'days'),
		};
	});
}

/** Legs typed for the shared leg maths. */
export function legsOf(trip: TripData): Leg[] {
	const opt = (s: string): string | undefined => (s === '' ? undefined : s);
	return trip.legs.map((l): Leg => ({
		id: l.id,
		type: opt(str(l, 'type')),
		start: opt(str(l, 'start')),
		end: opt(str(l, 'end')),
		country: opt(str(l, 'country')),
		city: opt(str(l, 'city')),
		order: typeof l['order'] === 'number' ? l['order'] : undefined,
	}));
}

/**
 * The budget of where you are today, else of the next stay abroad (before departure), else null (old
 * currentBudget). `today` is the local YYYY-MM-DD.
 */
export function currentBudget(
	trip: TripData,
	rows: readonly BudgetRow[],
	today: string,
): BudgetRow | null {
	const legs = legsOf(trip);
	const stay =
		hereOn(legs, today) ??
		legsSorted(legs).find(
			(l) => l.type === 'stay' && dayKey(l.start) > today && l.country !== 'brazil',
		);
	return rows.find((b) => b.country === stay?.country) ?? null;
}

export type FixedStatus = 'paid' | 'topay' | 'estimate';
export const FIXED_STATUS: Readonly<
	Record<FixedStatus, { label: string; tone: 'booked' | 'planned' | 'tbd' }>
> = {
	paid: { label: 'Paid', tone: 'booked' },
	topay: { label: 'To pay', tone: 'planned' },
	estimate: { label: 'Estimate', tone: 'tbd' },
};

export interface FixedRow {
	id: string;
	title: string;
	note: string;
	amount: number;
	status: FixedStatus;
}

export function fixedRows(trip: TripData): FixedRow[] {
	return sortedByOrder(trip.fixed).map((x) => {
		const s = str(x, 'status');
		return {
			id: x.id,
			title: str(x, 'title'),
			note: str(x, 'note'),
			amount: num(x, 'amount'),
			status: s === 'paid' || s === 'topay' ? s : 'estimate',
		};
	});
}

export interface SpendRow {
	id: string;
	date: string;
	note: string;
	category: SpendCategory;
	country: string;
	currency: string;
	amount: number;
	amountBRL: number;
	/** What the row says: the note, else the category, else "Expense". */
	label: string;
}

const isCategory = (s: string): s is SpendCategory => s === 'bed' || s === 'food' || s === 'other';

/** The log, newest date first, then the latest written first (old sort). */
export function spendRows(trip: TripData): SpendRow[] {
	return [...trip.spend]
		.sort(
			(a, b) => str(b, 'date').localeCompare(str(a, 'date')) || num(b, 'order') - num(a, 'order'),
		)
		.map((x) => {
			const raw = str(x, 'category');
			const category = isCategory(raw) ? raw : 'other';
			return {
				id: x.id,
				date: str(x, 'date'),
				note: str(x, 'note'),
				category,
				country: str(x, 'country'),
				currency: str(x, 'currency'),
				amount: num(x, 'amount'),
				amountBRL: num(x, 'amountBRL'),
				label: str(x, 'note') || (isCategory(raw) ? CAT_LABEL[raw] : 'Expense'),
			};
		});
}

export interface SpendGroup {
	date: string;
	/** "Sun 6 Dec", or "No date". */
	label: string;
	total: number;
	items: SpendRow[];
}

/** Consecutive rows of one date, with the day's total (old t-group headers). */
export function spendGroups(rows: readonly SpendRow[]): SpendGroup[] {
	const groups: SpendGroup[] = [];
	for (const x of rows) {
		const last = groups.at(-1);
		if (last?.date === x.date) last.items.push(x);
		else
			groups.push({
				date: x.date,
				label: x.date === '' ? 'No date' : fmtDay(x.date),
				total: 0,
				items: [x],
			});
	}
	for (const g of groups) {
		g.total = rows.filter((y) => y.date === g.date).reduce((a, y) => a + y.amountBRL, 0);
	}
	return groups;
}

export const spentIn = (rows: readonly SpendRow[], pick: (r: SpendRow) => boolean): number =>
	rows.filter(pick).reduce((a, x) => a + x.amountBRL, 0);

export interface CountryCard {
	row: BudgetRow;
	daily: number;
	planned: number;
	spent: number;
	/** Bed / food / other as shares of the day (0..100). */
	split: Record<SpendCategory, number>;
	/** Spent as a share of planned, capped at 100. */
	spentPct: number;
	over: boolean;
}

export function countryCards(
	rows: readonly BudgetRow[],
	spend: readonly SpendRow[],
): CountryCard[] {
	return rows.map((row) => {
		const daily = dailyOf(row);
		const d = daily || 1;
		const planned = daily * row.days;
		const spent = spentIn(spend, (x) => x.country === row.country);
		return {
			row,
			daily,
			planned,
			spent,
			split: {
				bed: (row.bed / d) * 100,
				food: (row.food / d) * 100,
				other: (row.other / d) * 100,
			},
			spentPct: Math.min(100, planned ? (spent / planned) * 100 : 100),
			over: spent > planned,
		};
	});
}

export interface Summary extends MoneyTotals {
	/** Fixed and ground totals as shares of the bar (the larger of cap and plan is 100). */
	fixedPct: number;
	groundPct: number;
}

export function summary(
	trip: TripData,
	rows: readonly BudgetRow[],
	fixed: readonly FixedRow[],
	spend: readonly SpendRow[],
): Summary {
	const settings = trip.settings.map((s) => ({ id: s.id, cap: num(s, 'cap') }));
	const m = moneyTotals({ budget: rows, fixed, spend, settings });
	const scale = Math.max(m.cap, m.planT) || 1;
	return { ...m, fixedPct: (m.fixedT / scale) * 100, groundPct: (m.groundT / scale) * 100 };
}

export type CheckKind = 'bed' | 'food' | 'other';
export const CHECK_KINDS: readonly { id: CheckKind; label: string }[] = [
	{ id: 'bed', label: 'Bed, per night' },
	{ id: 'food', label: 'Food, per day' },
	{ id: 'other', label: 'Other, per day' },
];
const CHECK_WHAT: Readonly<Record<CheckKind, string>> = {
	bed: 'bed budget per night',
	food: 'food budget per day',
	other: 'budget per day for everything else',
};

export interface CheckInput {
	country: string;
	kind: CheckKind;
	price: string;
	cur: string;
}

export interface CheckVerdict {
	level: 'idle' | 'ok' | 'warn' | 'over';
	text: string;
}

/** The booking check's verdict line (old verdictHtml), word for word. */
export function checkVerdict(rows: readonly BudgetRow[], input: CheckInput): CheckVerdict {
	const b = rows.find((x) => x.country === input.country);
	const price = parseFloat(input.price.replace(',', '.'));
	const r = priceCheck(b, input.kind, price, input.cur);
	const what = CHECK_WHAT[input.kind];
	const brl = 'brl' in r ? r.brl : 0;
	const conv =
		brl && input.cur !== 'BRL'
			? `${price.toLocaleString('pt-BR')} ${input.cur} ≈ ${fmtR(brl)}. `
			: '';
	if (r.level === 'idle') {
		return {
			level: 'idle',
			text: brl
				? `${conv}No ${what} set for ${b?.name ?? ''}.`
				: 'Type a price to compare it with your daily budget.',
		};
	}
	const name = b?.name ?? '';
	const msg =
		r.level === 'ok'
			? `${fmtR(r.diff)} under your ${fmtR(r.limit)} ${what} in ${name}.`
			: `${fmtR(r.diff)} over your ${fmtR(r.limit)} ${what} in ${name}.${
					r.level === 'warn'
						? ' Fine if you save elsewhere.'
						: ' Look for something cheaper, or plan to make it up.'
				}`;
	return { level: r.level, text: conv + msg };
}

/**
 * The booking check's country and currency when the current choice is not a budgeted country: where you are (or
 * go next), else the first budget row (old viewMoney).
 */
export function checkDefaults(
	input: CheckInput,
	rows: readonly BudgetRow[],
	current: BudgetRow | null,
): CheckInput {
	if (rows.length === 0 || rows.some((b) => b.country === input.country)) return input;
	const c = current ?? rows[0];
	if (c === undefined) return input;
	return { ...input, country: c.country, cur: c.currency || 'BRL' };
}

/** The settings row's cap and money tips. */
export function settingsOf(trip: TripData): { exists: boolean; cap: number; tips: string } {
	const s: TripDoc | undefined = trip.settings.find((x) => x.id === 'main');
	return { exists: s !== undefined, cap: num(s, 'cap'), tips: str(s, 'tips') };
}
