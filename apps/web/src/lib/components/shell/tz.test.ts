import { tzText } from '@atr/shared/trip';
import { describe, expect, test } from 'vitest';
import { clockOf, tzSegments, type TzSegment } from './tz';

const joined = (segs: TzSegment[]): string =>
	segs.map((s) => (s.kind === 'text' ? s.text : ` ${s.label}`)).join('');

describe('tzSegments', () => {
	test('labels every time and run of times, like the old watchTimes pass', () => {
		const text = 'Work nights 20:00–05:00 Dec 28–30; shows at 20:00, 21:00 and 22:00.';
		const segs = tzSegments(text, 8);
		expect(segs.filter((s) => s.kind === 'tz')).toHaveLength(2);
		expect(joined(segs)).toBe(tzText(text, 'UTC+8'));
	});

	test('half-hour and negative offsets', () => {
		expect(joined(tzSegments('leave 08:30', -3))).toBe('leave 08:30 UTC−3');
		expect(joined(tzSegments('at 9am', '5.5'))).toBe('at 9am UTC+5:30');
	});

	test('a time that already has its zone, an unknown offset and empty text are left alone', () => {
		expect(tzSegments('landing 15:35 UTC+8', 8)).toEqual([
			{ kind: 'text', text: 'landing 15:35 UTC+8' },
		]);
		expect(tzSegments('at 08:30', null)).toEqual([{ kind: 'text', text: 'at 08:30' }]);
		expect(tzSegments('', 8)).toEqual([]);
	});
});

describe('clockOf', () => {
	test('reads HH:MM, wall-clock stamps and ISO stamps', () => {
		expect(clockOf('8:05')).toBe('08:05');
		expect(clockOf('2026-12-06T08:30')).toBe('08:30');
		expect(clockOf('2026-12-06T23:55:00Z')).toBe('23:55');
		expect(clockOf('2026-12-06')).toBe('');
	});
});
