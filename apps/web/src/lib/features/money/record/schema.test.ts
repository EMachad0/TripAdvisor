import { describe, expect, it } from 'vitest';
import type { ContentCountry } from '#lib/content/types.js';
import { bagCategories, initialValues, recordSchema, submitData, taskStatus } from './schema.ts';

const COUNTRIES: ContentCountry[] = [
	{ id: 'china', name: 'China', flag: '🇨🇳', from: '', to: '', cities: [] },
];
const SPEND_DEFAULTS = { today: '2026-12-06', country: 'china', currency: 'CNY' };

describe('recordSchema', () => {
	it('lists Not set, Brazil and the trip countries', () => {
		const country = recordSchema('spend', COUNTRIES).fields.find((f) => f.key === 'country');
		expect(country?.options?.map((o) => o.value)).toEqual(['', 'brazil', 'china']);
	});
	it('offers every currency of RATES', () => {
		const cur = recordSchema('budget', COUNTRIES).fields.find((f) => f.key === 'currency');
		expect(cur?.options?.map((o) => o.value)).toEqual([
			'BRL',
			'USD',
			'CNY',
			'THB',
			'SGD',
			'KRW',
			'JPY',
			'HKD',
		]);
	});
});

describe('initialValues', () => {
	it('starts a new expense today, as food, in the current country and currency', () => {
		const s = recordSchema('spend', COUNTRIES);
		expect(initialValues(s, 'spend', null, SPEND_DEFAULTS)).toEqual({
			note: '',
			amount: '',
			currency: 'CNY',
			category: 'food',
			country: 'china',
			date: '2026-12-06',
		});
		expect(
			initialValues(s, 'spend', null, { today: 'x', country: '', currency: '' })['currency'],
		).toBe('BRL');
	});
	it('shows a task its effective status', () => {
		const s = recordSchema('tasks', COUNTRIES);
		expect(
			initialValues(s, 'tasks', { id: 't', title: 'A', done: true }, SPEND_DEFAULTS)['status'],
		).toBe('done');
		expect(initialValues(s, 'tasks', null, SPEND_DEFAULTS)['status']).toBe('todo');
		expect(taskStatus({ id: 't', status: 'doing', done: true })).toBe('doing');
	});
	it('turns stored numbers into text and an unknown select value into the first option', () => {
		const s = recordSchema('fixed', COUNTRIES);
		expect(
			initialValues(s, 'fixed', { id: 'f', title: 'Flights', amount: 9000 }, SPEND_DEFAULTS),
		).toEqual({
			title: 'Flights',
			amount: '9000',
			status: 'topay',
			note: '',
		});
	});
});

describe('submitData', () => {
	it('trims text, reads numbers and sends every field of a new document', () => {
		const s = recordSchema('bag', COUNTRIES);
		expect(
			submitData(s, { item: ' Boots ', category: 'Clothes', qty: '', note: '' }, null),
		).toEqual({
			ok: true,
			data: { item: 'Boots', category: 'Clothes', qty: 0, note: '' },
		});
	});
	it('refuses an empty name or amount with the old messages', () => {
		expect(
			submitData(recordSchema('tasks', COUNTRIES), { title: '  ', note: '', status: 'todo' }, null),
		).toEqual({
			ok: false,
			message: 'Give it a name first.',
		});
		const spend = recordSchema('spend', COUNTRIES);
		expect(
			submitData(
				spend,
				{ amount: '0', note: 'x', currency: 'BRL', category: 'food', country: '', date: '' },
				null,
			),
		).toEqual({
			ok: false,
			message: 'Enter the amount first.',
		});
	});
	it('sends only the changed fields of an edit, or nothing', () => {
		const s = recordSchema('fixed', COUNTRIES);
		const initial = { title: 'Flights', amount: '9000', status: 'paid', note: '' };
		expect(submitData(s, { ...initial, amount: '9500', note: ' x ' }, initial)).toEqual({
			ok: true,
			data: { amount: 9500, note: 'x' },
		});
		expect(submitData(s, { ...initial, title: 'Flights ' }, initial)).toEqual({
			ok: true,
			data: null,
		});
	});
});

describe('bagCategories', () => {
	it('lists each category once, in order', () => {
		expect(
			bagCategories([
				{ id: 'a', category: 'Tech' },
				{ id: 'b', category: '' },
				{ id: 'c', category: 'Clothes' },
				{ id: 'd', category: 'Tech' },
			]),
		).toEqual(['Tech', 'Clothes']);
	});
});
