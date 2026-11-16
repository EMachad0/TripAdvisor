// Unit tests for the Trip tab's pure parts: formatting, the itinerary and calendar models, and the form shaping.
// Expected values come from the old code (game/public/trip.js) run on the same inputs.
import { describe, expect, it } from 'vitest';
import type { TripPlace } from '@atr/shared/trip';
import { calendarModel, dayArg, daySheetModel } from './calendar.ts';
import {
	countryName,
	fmtDay,
	fmtShort,
	legStatus,
	linkParts,
	or,
	parsePlan,
	plural,
	safeUrl,
	uberTo,
} from './format.ts';
import { fieldShown, formTitle, initialValues, submitArgs, tripSchema } from './forms.ts';
import { itineraryModel, layoverLabel } from './itinerary.ts';
import { asDay, asLeg, type TripLeg } from './types.ts';

const COUNTRIES = [
	{ id: 'china', name: 'China', flag: '🇨🇳' },
	{ id: 'japan', name: 'Japan', flag: '🇯🇵' },
];

const LEGS: TripLeg[] = [
	{
		id: 'gru-pvg',
		type: 'flight',
		status: 'booked',
		from: 'GRU',
		fromName: 'São Paulo',
		to: 'PVG',
		toName: 'Shanghai',
		start: '2026-12-04T23:55',
		end: '2026-12-06T06:10',
		order: 1,
	},
	{
		id: 'pvg-pek',
		type: 'flight',
		status: 'planned',
		from: 'PVG',
		to: 'PEK',
		start: '2026-12-06T09:00',
		end: '2026-12-06T11:15',
		order: 2,
	},
	{
		id: 'stay-sh',
		type: 'stay',
		status: 'booked',
		country: 'china',
		city: 'shanghai',
		title: 'Shanghai · Dayin',
		// A dated stay with no time sorts before timed legs of its day; a check-in time keeps it after the flights.
		start: '2026-12-06T12:00',
		end: '2026-12-09',
		order: 3,
	},
	{
		id: 'stay-kyoto',
		type: 'stay',
		status: 'tbd',
		country: 'japan',
		city: 'kyoto',
		cities: ['kyoto', 'osaka'],
		title: 'Kansai base',
		start: '2027-01-10',
		end: '2027-01-12',
		order: 4,
	},
	{ id: 'undated', type: 'note', title: 'Someday', order: 5 },
];

describe('format', () => {
	it('formats days like the old site', () => {
		expect(fmtDay('2026-12-06T06:10')).toBe('Sun 6 Dec');
		expect(fmtShort('2027-01-02')).toBe('2 Jan');
		expect(fmtDay('')).toBe('');
		expect(plural(1, 'night')).toBe('1 night');
		expect(plural(3, 'night')).toBe('3 nights');
		expect(or('', 'Untitled')).toBe('Untitled');
	});

	it('marks a planned Uber or metro transfer as On the day', () => {
		expect(legStatus({ type: 'transport', status: 'planned', mode: 'Uber' })).toBe('onday');
		expect(legStatus({ type: 'transport', mode: 'train' })).toBe('planned');
		expect(legStatus({ type: 'stay', status: 'tbd' })).toBe('tbd');
	});

	it('parses a plan into timed and key steps', () => {
		expect(parsePlan('12:30 Request Uber\n!Mon 13:05 – Board\n\nWalk to gate')).toEqual([
			{ key: false, t: '12:30', text: 'Request Uber' },
			{ key: true, t: 'Mon 13:05', text: 'Board' },
			{ key: false, t: '', text: 'Walk to gate' },
		]);
	});

	it('splits links out of free text and shortens them', () => {
		expect(linkParts('See https://www.trip.com/b/123/ now')).toEqual([
			{ kind: 'text', text: 'See ' },
			{ kind: 'link', href: 'https://www.trip.com/b/123/', text: 'trip.com/b/123' },
			{ kind: 'text', text: ' now' },
		]);
		expect(safeUrl('trip.com/x')).toBe('https://trip.com/x');
		expect(uberTo('A B')).toContain('pickup=my_location&dropoff%5Bformatted_address%5D=A%20B');
		expect(countryName('brazil', COUNTRIES)).toBe('Brazil');
		expect(countryName('japan', COUNTRIES)).toBe('Japan');
	});
});

describe('itineraryModel', () => {
	it('counts, jumps, layovers and the date column', () => {
		const m = itineraryModel(LEGS, '2026-11-15', fmtDay);
		expect(m.eyebrow).toBe('Fri 4 Dec → Tue 12 Jan · 40 days');
		expect(m.lede).toContain('1 of 2 flights booked, 1 stay still to book.');
		expect(m.jumps.map((j) => j.country)).toEqual(['china', 'japan']);
		const layover = m.items.find((i) => i.kind === 'layover');
		expect(layover).toMatchObject({ minutes: 170, where: 'Shanghai' });
		expect(layoverLabel(170)).toBe('2h 50m');
		const legs = m.items.flatMap((i) => (i.kind === 'leg' ? [i] : []));
		expect(legs[0]?.when).toEqual({ day: '4', label: 'Dec · Fri' });
		expect(legs[2]?.when).toBeNull(); // same day as the flight before it
		expect(legs.at(-1)?.when).toBe('nodate');
		expect(m.items.some((i) => i.kind === 'today')).toBe(false); // before the trip
		expect(m.scrollToToday).toBe(false);
	});

	it('draws the Today line and marks the stay you are in', () => {
		const m = itineraryModel(LEGS, '2026-12-07', fmtDay);
		const kinds = m.items.map((i) => (i.kind === 'leg' ? i.leg.id : i.kind));
		expect(kinds.indexOf('today')).toBe(kinds.indexOf('stay-kyoto') - 1);
		const now = m.items.find((i) => i.kind === 'leg' && i.isNow);
		expect(now?.kind === 'leg' && now.leg.id).toBe('stay-sh');
		expect(m.scrollToToday).toBe(true);
	});

	it('handles an empty trip', () => {
		const m = itineraryModel([], '2026-12-07', fmtDay);
		expect(m.eyebrow).toBe('Itinerary');
		expect(m.lede).toBe('Flights, stays and moves in date order. Times are local to each airport or city.');
	});
});

describe('calendarModel', () => {
	const place = (p: Partial<TripPlace> & { id: string }): TripPlace => ({ ...p });
	const places = [
		place({ id: 'fest', country: 'china', city: 'shanghai', days: [{ from: '2026-12-07', to: '2026-12-07' }] }),
		place({ id: 'skipped', country: 'china', city: 'shanghai', verdict: 'skip', days: [{ from: '2026-12-08', to: '2026-12-08' }] }),
	];
	const days = [
		{ id: '2026-12-08', status: 'work', holiday: '', note: 'Night shift' },
		{ id: '2026-12-25', status: 'off', holiday: 'Christmas' },
	];

	it('builds one cell per day with colours, labels and marks', () => {
		const m = calendarModel(LEGS, days, places, '2026-12-07');
		expect(m.months.map((x) => x.key)).toEqual(['2026-12', '2027-01']);
		expect(m.keys).toEqual(['china', 'japan']);
		const dec = m.months[0];
		expect(dec?.lead).toBe(2); // 1 Dec 2026 is a Tuesday
		const cell = (k: string) => m.months.flatMap((x) => x.days).find((c) => c.key === k);
		expect(cell('2026-12-04')).toMatchObject({ flight: true, inTrip: true, stay: null });
		expect(cell('2026-12-06')).toMatchObject({ color: 1, label: 'Shanghai', flight: true });
		expect(cell('2026-12-07')).toMatchObject({ today: true, dot: true, label: '' });
		expect(cell('2026-12-08')).toMatchObject({ status: 'work', dot: true });
		expect(cell('2026-12-25')).toMatchObject({ holiday: 'Christmas', out: false, inTrip: true });
		expect(cell('2027-01-10')).toMatchObject({ color: 2, tbd: true, label: 'Kansai base' });
		expect(cell('2027-01-31')).toMatchObject({ out: true, inTrip: false });
		expect(cell('2026-12-07')?.aria).toBe('Mon 7 Dec, Shanghai, 1 dated card');
	});

	it('models a day sheet', () => {
		const d = daySheetModel(LEGS, days, places, '2026-12-07');
		expect(d.position).toBe('Day 4 of 40');
		expect(d.stay?.id).toBe('stay-sh');
		expect(d.dated.map((h) => h.place.id)).toEqual(['fest']);
		expect(daySheetModel(LEGS, days, places, '2027-03-01').position).toBe('Outside the trip');
	});

	it('accepts only real days in the URL', () => {
		expect(dayArg('2027-01-30')).toBe('2027-01-30');
		expect(dayArg('2027-02-30')).toBeNull();
		expect(dayArg('today')).toBeNull();
		expect(dayArg(undefined)).toBeNull();
	});
});

describe('forms', () => {
	const schema = tripSchema(COUNTRIES);

	it('opens a new stop as a planned stay and an existing one with split date and time', () => {
		const empty = initialValues('legs', schema.legs, null, { today: '2026-11-15' });
		expect(empty['type']).toBe('stay');
		expect(empty['status']).toBe('planned');
		const v = initialValues(
			'legs',
			schema.legs,
			{ id: 'k', type: 'stay', start: '2027-01-10T15:00', cities: ['kyoto', 'osaka'], country: 'japan' },
			{ today: '2026-11-15' },
		);
		expect(v).toMatchObject({ startDate: '2027-01-10', startTime: '15:00', city: 'kyoto, osaka', country: 'japan' });
		expect(formTitle('legs', schema.legs, 'k', true)).toBe('Edit stop');
		expect(formTitle('days', schema.days, '2026-12-24', false)).toBe('Thu 24 Dec');
	});

	it('shows leg fields by kind', () => {
		const host = schema.legs.fields.find((f) => f.key === 'host');
		const fromName = schema.legs.fields.find((f) => f.key === 'fromName');
		expect(host && fieldShown(host, 'stay')).toBe(true);
		expect(host && fieldShown(host, 'flight')).toBe(false);
		expect(fromName && fieldShown(fromName, 'transport')).toBe(true);
		expect(fromName && fieldShown(fromName, 'note')).toBe(false);
	});

	it('sends every field for a new document and refuses one with no name', () => {
		const init = initialValues('legs', schema.legs, null, { today: '2026-11-15' });
		expect(submitArgs('legs', schema.legs, null, false, init, init)).toEqual({
			ok: false,
			message: 'Give it a name first.',
		});
		const flight = { ...init, type: 'flight', from: 'gru', to: 'pvg' };
		const r = submitArgs('legs', schema.legs, null, false, flight, init);
		expect(r?.ok && r.args.op).toBe('set');
		expect(r?.ok && r.args.data?.['title']).toBe('GRU → PVG');
		expect(r?.ok && 'id' in r.args).toBe(false);
	});

	it('sends only changed fields on an edit, keeping a date with its time', () => {
		const doc = { id: 'stay-sh', type: 'stay', title: 'Shanghai', start: '2026-12-06T14:00', end: '2026-12-09' };
		const init = initialValues('legs', schema.legs, doc, { today: '2026-11-15' });
		expect(submitArgs('legs', schema.legs, 'stay-sh', true, init, init)).toBeNull();
		const r = submitArgs('legs', schema.legs, 'stay-sh', true, { ...init, startTime: '15:00', note: ' hi ' }, init);
		expect(r).toEqual({
			ok: true,
			args: {
				col: 'legs',
				op: 'update',
				id: 'stay-sh',
				data: { startDate: '2026-12-06', startTime: '15:00', note: 'hi' },
			},
		});
	});

	it('days, fixed costs and settings', () => {
		const day = initialValues('days', schema.days, null, { today: '2026-11-15' });
		const d = submitArgs('days', schema.days, '2026-12-24', false, { ...day, note: 'Harbin' }, day);
		expect(d).toEqual({
			ok: true,
			args: { col: 'days', op: 'set', id: '2026-12-24', data: { status: '', holiday: '', note: 'Harbin' } },
		});
		const fixed = initialValues('fixed', schema.fixed, null, { today: '2026-11-15' });
		expect(fixed['status']).toBe('topay');
		const f = submitArgs('fixed', schema.fixed, null, false, { ...fixed, title: 'eSIM', amount: '120,5' }, fixed);
		expect(f).toEqual({ ok: false, message: 'Type a number.' });
		const f2 = submitArgs('fixed', schema.fixed, null, false, { ...fixed, title: 'eSIM', amount: '120.5' }, fixed);
		expect(f2?.ok && f2.args.data?.['amount']).toBe(120.5);
		const set = initialValues('settings', schema.settings, { id: 'main', cap: 40000, tips: 'x' }, { today: '' });
		expect(set).toEqual({ cap: '40000', tips: 'x' });
		expect(submitArgs('settings', schema.settings, 'main', true, { ...set, cap: '' }, set)).toEqual({
			ok: false,
			message: 'Give it a name first.',
		});
		const spend = initialValues('spend', schema.spend, null, {
			today: '2026-12-07',
			currentBudget: { country: 'china', currency: 'CNY' },
		});
		expect(spend).toMatchObject({ date: '2026-12-07', category: 'food', country: 'china', currency: 'CNY' });
		expect(submitArgs('spend', schema.spend, null, false, spend, spend)).toEqual({
			ok: false,
			message: 'Enter the amount first.',
		});
	});
});

describe('adapters', () => {
	it('keep only values of the expected type', () => {
		expect(asLeg({ id: 'a', title: 'T', order: 2, tz: 'Asia/Tokyo', cities: null, start: 5 })).toEqual({
			id: 'a',
			title: 'T',
			order: 2,
			tz: 'Asia/Tokyo',
			cities: null,
		});
		expect(asDay({ id: '2026-12-24', status: 'work', note: 3 })).toEqual({ id: '2026-12-24', status: 'work' });
	});
});
