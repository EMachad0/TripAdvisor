import { expect, test } from 'vitest';
import { hashTarget } from './hash-links';

test('old page hashes open the new paths', () => {
	expect(hashTarget('#/')).toBe('/');
	expect(hashTarget('#/home')).toBe('/decide');
	expect(hashTarget('#/game')).toBe('/decide');
	expect(hashTarget('#/route')).toBe('/trip/map');
	expect(hashTarget('#/calls')).toBe('/decide/calls');
	expect(hashTarget('#/todo')).toBe('/prep/todo');
	expect(hashTarget('#/nope')).toBe('/');
});

test('arguments become path segments', () => {
	expect(hashTarget('#/today/2027-01-30')).toBe('/today/2027-01-30');
	expect(hashTarget('#/calendar/2027-01-30')).toBe('/trip/calendar/2027-01-30');
	expect(hashTarget('#/places/beijing+shanghai')).toBe('/places/beijing+shanghai');
	expect(hashTarget('#/answers/some-id')).toBe('/places/answers/some-id');
	expect(hashTarget('#/swipe/extra')).toBe('/decide/swipe');
});

test('in-page anchors are left alone', () => {
	expect(hashTarget('')).toBeNull();
	expect(hashTarget('#answer-x')).toBeNull();
});
