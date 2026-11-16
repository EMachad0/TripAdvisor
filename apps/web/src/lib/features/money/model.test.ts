import { describe, expect, it } from 'vitest';
import type { ContentCountry } from '#lib/content/types.js';
import {
	budgetRows,
	checkDefaults,
	checkVerdict,
	countryCards,
	countryName,
	currentBudget,
	fixedRows,
	fmtDay,
	fmtR,
	settingsOf,
	spendGroups,
	spendRows,
	summary,
} from './model.ts';
import { byOrder, type TripData } from './trip-docs.ts';

const COUNTRIES: ContentCountry[] = [
	{
		id: 'china',
		name: 'China',
		flag: '🇨🇳',
		days: 27,
		from: '2026-12-06',
		to: '2027-01-02',
		cities: [],
	},
	{
		id: 'japan',
		name: 'Japan',
		flag: '🇯🇵',
		days: 20,
		from: '2027-01-20',
		to: '2027-02-09',
		cities: [],
	},
];

function trip(partial: Partial<TripData> = {}): TripData {
	return {
		tasks: [],
		legs: [],
		bag: [],
		budget: [],
		fixed: [],
		spend: [],
		settings: [],
		days: [],
		visited: [],
		...partial,
	};
}

const BASE = trip({
	budget: [
		{ id: 'jp', country: 'japan', currency: 'JPY', bed: 150, food: 100, other: 50, order: 2 },
		{
			id: 'cn',
			country: 'china',
			currency: 'CNY',
			bed: 120,
			food: 90,
			other: 60,
			order: 1,
			pay: 'Alipay',
		},
	],
	fixed: [
		{ id: 'ins', title: 'Insurance', amount: 1000, status: 'topay', order: 2 },
		{ id: 'fl', title: 'Flights', amount: 9000, status: 'paid', order: 1 },
		{ id: 'esim', title: 'eSIM', amount: '50', order: 3 },
	],
	spend: [
		{
			id: 'a',
			date: '2026-12-06',
			note: 'Metro',
			amount: 50,
			currency: 'CNY',
			amountBRL: 36,
			category: 'other',
			country: 'china',
			order: 1,
		},
		{
			id: 'b',
			date: '2026-12-07',
			note: '',
			amount: 100,
			currency: 'BRL',
			amountBRL: 100,
			category: 'food',
			country: 'china',
			order: 2,
		},
		{
			id: 'c',
			date: '2026-12-06',
			note: 'Hostel',
			amount: 120,
			currency: 'CNY',
			amountBRL: 86.4,
			category: 'bed',
			country: 'china',
			order: 3,
		},
		{ id: 'd', amount: 10, amountBRL: 10, category: 'weird', order: 4 },
	],
	settings: [{ id: 'main', cap: 40000, tips: 'Convert a few days at a time.' }],
	legs: [
		{
			id: 's1',
			type: 'stay',
			start: '2026-12-06',
			end: '2026-12-10',
			country: 'china',
			city: 'shanghai',
		},
		{
			id: 's2',
			type: 'stay',
			start: '2027-01-20',
			end: '2027-01-25',
			country: 'japan',
			city: 'tokyo',
		},
	],
});

describe('formatting', () => {
	it('writes reais like the old page', () => {
		expect(fmtR(1234.6)).toBe('R$ 1.235');
		expect(fmtR('x')).toBe('R$ 0');
		expect(fmtR(-5)).toBe('R$ -5');
	});
	it('writes days as weekday, day, month', () => {
		expect(fmtDay('2026-12-06')).toBe('Sun 6 Dec');
		expect(fmtDay('2027-01-02T08:00')).toBe('Sat 2 Jan');
		expect(fmtDay('')).toBe('');
	});
	it('names Brazil and unknown ids', () => {
		expect(countryName(COUNTRIES, 'brazil')).toBe('Brazil');
		expect(countryName(COUNTRIES, 'china')).toBe('China');
		expect(countryName(COUNTRIES, 'mars')).toBe('mars');
		expect(countryName(COUNTRIES, '')).toBe('');
	});
});

describe('rows', () => {
	it('orders by order, then by title or item', () => {
		expect(
			byOrder({ id: 'a', order: 1, title: 'B' }, { id: 'b', order: 1, item: 'A' }),
		).toBeGreaterThan(0);
		expect(byOrder({ id: 'a', order: 1 }, { id: 'b', order: 2 })).toBeLessThan(0);
	});
	it('joins budget rows with the config days', () => {
		const rows = budgetRows(BASE, COUNTRIES);
		expect(rows.map((r) => [r.country, r.days, r.name, r.flag])).toEqual([
			['china', 27, 'China', '🇨🇳'],
			['japan', 20, 'Japan', '🇯🇵'],
		]);
	});
	it('reads fixed costs with a default status', () => {
		expect(fixedRows(BASE).map((x) => [x.title, x.status, x.amount])).toEqual([
			['Flights', 'paid', 9000],
			['Insurance', 'topay', 1000],
			['eSIM', 'estimate', 50],
		]);
	});
	it('sorts the log newest date first, then latest written, and labels rows', () => {
		const rows = spendRows(BASE);
		expect(rows.map((r) => r.id)).toEqual(['b', 'c', 'a', 'd']);
		expect(rows.map((r) => r.label)).toEqual(['Food', 'Hostel', 'Metro', 'Expense']);
		expect(rows[3]?.category).toBe('other');
	});
	it('groups the log by day with day totals', () => {
		const groups = spendGroups(spendRows(BASE));
		expect(groups.map((g) => [g.label, g.total, g.items.length])).toEqual([
			['Mon 7 Dec', 100, 1],
			['Sun 6 Dec', 122.4, 2],
			['No date', 10, 1],
		]);
	});
});

describe('totals', () => {
	it('sums the plan, the cap and the spare', () => {
		const rows = budgetRows(BASE, COUNTRIES);
		const s = summary(BASE, rows, fixedRows(BASE), spendRows(BASE));
		expect(s.cap).toBe(40000);
		expect(s.fixedT).toBe(10050);
		expect(s.groundT).toBe(270 * 27 + 300 * 20);
		expect(s.planT).toBe(s.fixedT + s.groundT);
		expect(s.spare).toBe(40000 - s.planT);
		expect(s.days).toBe(47);
		expect(s.spentT).toBeCloseTo(232.4);
		expect(s.fixedPct + s.groundPct).toBeCloseTo((s.planT / 40000) * 100);
	});
	it('scales the bar to the plan when it is over the cap', () => {
		const t = trip({ ...BASE, settings: [{ id: 'main', cap: 1000 }] });
		const rows = budgetRows(t, COUNTRIES);
		const s = summary(t, rows, fixedRows(t), []);
		expect(s.fixedPct + s.groundPct).toBeCloseTo(100);
	});
	it('builds per-country cards with the split and the spend', () => {
		const [cn, jp] = countryCards(budgetRows(BASE, COUNTRIES), spendRows(BASE));
		expect(cn?.daily).toBe(270);
		expect(cn?.planned).toBe(270 * 27);
		expect(cn?.spent).toBeCloseTo(222.4);
		expect(cn?.split.bed).toBeCloseTo((120 / 270) * 100);
		expect(cn?.over).toBe(false);
		expect(jp?.spent).toBe(0);
	});
	it('reads the settings row', () => {
		expect(settingsOf(BASE)).toEqual({
			exists: true,
			cap: 40000,
			tips: 'Convert a few days at a time.',
		});
		expect(settingsOf(trip())).toEqual({ exists: false, cap: 0, tips: '' });
	});
});

describe('booking check', () => {
	const rows = budgetRows(BASE, COUNTRIES);
	it('asks for a price first', () => {
		expect(checkVerdict(rows, { country: 'china', kind: 'bed', price: '', cur: 'CNY' })).toEqual({
			level: 'idle',
			text: 'Type a price to compare it with your daily budget.',
		});
	});
	it('says how far under the budget a price is, with the conversion', () => {
		const v = checkVerdict(rows, { country: 'china', kind: 'bed', price: '100', cur: 'CNY' });
		expect(v.level).toBe('ok');
		expect(v.text).toBe('100 CNY ≈ R$ 72. R$ 48 under your R$ 120 bed budget per night in China.');
	});
	it('warns a little over and alarms far over', () => {
		const warn = checkVerdict(rows, { country: 'china', kind: 'food', price: '100', cur: 'BRL' });
		expect(warn).toEqual({
			level: 'warn',
			text: 'R$ 10 over your R$ 90 food budget per day in China. Fine if you save elsewhere.',
		});
		const over = checkVerdict(rows, {
			country: 'china',
			kind: 'other',
			price: '200,5',
			cur: 'BRL',
		});
		expect(over.level).toBe('over');
		expect(over.text).toContain('Look for something cheaper, or plan to make it up.');
	});
	it('says when no budget is set for that kind', () => {
		const t = trip({ budget: [{ id: 'x', country: 'japan', bed: 0, food: 10 }] });
		const v = checkVerdict(budgetRows(t, COUNTRIES), {
			country: 'japan',
			kind: 'bed',
			price: '1000',
			cur: 'JPY',
		});
		expect(v).toEqual({
			level: 'idle',
			text: '1.000 JPY ≈ R$ 34. No bed budget per night set for Japan.',
		});
	});
	it('defaults to the country you are in, else the next stay, else the first row', () => {
		const empty = { country: '', kind: 'bed' as const, price: '', cur: '' };
		expect(currentBudget(BASE, rows, '2026-12-08')?.country).toBe('china');
		expect(currentBudget(BASE, rows, '2027-01-10')?.country).toBe('japan');
		expect(currentBudget(BASE, rows, '2027-03-01')).toBeNull();
		expect(checkDefaults(empty, rows, rows[1] ?? null)).toEqual({
			...empty,
			country: 'japan',
			cur: 'JPY',
		});
		expect(checkDefaults(empty, rows, null)).toEqual({ ...empty, country: 'china', cur: 'CNY' });
		const kept = { ...empty, country: 'japan', cur: 'USD' };
		expect(checkDefaults(kept, rows, null)).toBe(kept);
	});
});
