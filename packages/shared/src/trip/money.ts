// Calendar strip and money totals of the trip page.
import { lookup, orZero } from '../util.ts';
import { RATES } from './constants.ts';
import type { BudgetRow, DayDoc } from './types.ts';

export interface Period {
	kind: 'work' | 'vacation';
	from: string;
	to: string;
	n: number;
}

const DAY_ID = /^\d{4}-\d{2}-\d{2}$/;

/** Runs of work / vacation days for the strip above the calendar ("off" days break nothing and count nothing). */
export function periods(days: readonly DayDoc[] = []): Period[] {
	const runs: Period[] = [];
	const marked = days
		.filter((d) => DAY_ID.test(d.id) && ['work', 'vacation', 'off'].includes(d.status ?? ''))
		.sort((a, b) => a.id.localeCompare(b.id));
	for (const x of marked) {
		if (x.status !== 'work' && x.status !== 'vacation') continue;
		// The current run is always the last one pushed.
		const cur = runs.at(-1);
		if (cur?.kind === x.status) {
			cur.to = x.id;
			cur.n++;
		} else runs.push({ kind: x.status, from: x.id, to: x.id, n: 1 });
	}
	return runs;
}

const n0 = (v: unknown): number => Number(v) || 0;

/** R$ per day of a budget row: bed + food + other. */
export const dailyOf = (b: BudgetRow): number => n0(b.bed) + n0(b.food) + n0(b.other);

export interface MoneyTotals {
	cap: number;
	fixedT: number;
	groundT: number;
	spentT: number;
	planT: number;
	spare: number;
	days: number;
}

export function moneyTotals({
	budget = [],
	fixed = [],
	spend = [],
	settings = [],
}: {
	readonly budget?: readonly BudgetRow[];
	readonly fixed?: readonly { readonly amount?: number | string | undefined }[];
	readonly spend?: readonly { readonly amountBRL?: number | string | undefined }[];
	readonly settings?: readonly { readonly id: string; readonly cap?: number | string | undefined }[];
} = {}): MoneyTotals {
	const cap = n0(settings.find((s) => s.id === 'main')?.cap);
	const fixedT = fixed.reduce((a, x) => a + n0(x.amount), 0);
	const groundT = budget.reduce((a, b) => a + dailyOf(b) * n0(b.days), 0);
	const spentT = spend.reduce((a, x) => a + n0(x.amountBRL), 0);
	return {
		cap,
		fixedT,
		groundT,
		spentT,
		planT: fixedT + groundT,
		spare: cap - fixedT - groundT,
		days: budget.reduce((a, b) => a + n0(b.days), 0),
	};
}

export type PriceCheck =
	| { level: 'idle' }
	| { level: 'idle'; brl: number }
	| { level: 'ok' | 'warn' | 'over'; brl: number; limit: number; diff: number };

/** Booking check: is `price` in `cur` within the country's bed / food / other budget? */
export function priceCheck(
	b: BudgetRow | null | undefined,
	kind: 'bed' | 'food' | 'other',
	price: unknown,
	cur = 'BRL',
): PriceCheck {
	const brl = Number(price) * (orZero(lookup(RATES, cur)) || 1),
		lim = n0(b?.[kind]);
	if (!b || !(brl > 0)) return { level: 'idle' };
	if (!lim) return { level: 'idle', brl };
	const r = brl / lim;
	return {
		level: r <= 1 ? 'ok' : r <= 1.25 ? 'warn' : 'over',
		brl,
		limit: lim,
		diff: Math.abs(brl - lim),
	};
}
