import { describe, expect, test } from 'vitest';
import {
	badgeKind,
	dayLabel,
	localClock,
	pendingJson,
	pillText,
	unsyncedText,
	waitingText,
} from './status';

const base = { pending: 0, paused: false, offline: false, slow: false };

describe('badgeKind', () => {
	test('hidden when everything is saved and online, and while a quick write is on its way', () => {
		expect(badgeKind(base)).toBe('hidden');
		expect(badgeKind({ ...base, pending: 2 })).toBe('hidden');
	});
	test('"N unsynced" once pending writes are slow', () => {
		expect(badgeKind({ ...base, pending: 2, slow: true })).toBe('unsynced');
	});
	test('offline wins over unsynced; paused (with entries) wins over offline', () => {
		expect(badgeKind({ ...base, pending: 2, slow: true, offline: true })).toBe('offline');
		expect(badgeKind({ ...base, offline: true })).toBe('offline');
		expect(badgeKind({ ...base, pending: 1, paused: true, offline: true })).toBe('paused');
		expect(badgeKind({ ...base, pending: 0, paused: true })).toBe('hidden');
	});
});

describe('texts', () => {
	test('the plan wording', () => {
		expect(waitingText(3)).toBe('Writes paused, 3 waiting');
		expect(unsyncedText(1)).toBe('1 unsynced');
	});
	test('the pill keeps it short', () => {
		expect(pillText('paused', 2)).toBe('Paused · 2');
		expect(pillText('offline', 0)).toBe('Offline');
		expect(pillText('offline', 3)).toBe('Offline · 3');
		expect(pillText('unsynced', 1)).toBe('1 unsynced');
		expect(pillText('hidden', 0)).toBe('');
	});
	test('localClock gives the device clock and its UTC offset', () => {
		const iso = '2026-11-15T12:05:00.000Z';
		const d = new Date(iso);
		const c = localClock(iso);
		expect(c.offset).toBe(-d.getTimezoneOffset() / 60);
		expect(c.time).toMatch(/^\d{2}:\d{2}$/);
		expect(c.time).toBe(
			`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
		);
	});
	test('dayLabel is empty for today and a short date otherwise', () => {
		const now = new Date('2026-11-15T12:00:00');
		expect(dayLabel(new Date('2026-11-15T08:00:00').toISOString(), now)).toBe('');
		expect(dayLabel(new Date('2026-11-14T08:00:00').toISOString(), now)).toBe('14 Nov');
	});
	test('pendingJson is the entries as pretty JSON, oldest first', () => {
		const entries = [{ clientOpId: 'a' }, { clientOpId: 'b' }];
		expect(JSON.parse(pendingJson(entries))).toEqual(entries);
		expect(pendingJson(entries)).toContain('\n  ');
	});
});
