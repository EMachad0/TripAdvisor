import { expect, test } from 'vitest';
import { isPublicPath, safeRedirectTarget } from './auth-guard';

test('public paths', () => {
	expect(isPublicPath('/login')).toBe(true);
	expect(isPublicPath('/api/auth/sign-in/username')).toBe(true);
	expect(isPublicPath('/')).toBe(false);
	expect(isPublicPath('/loginx')).toBe(false);
	expect(isPublicPath('/trip')).toBe(false);
});

test('redirect targets stay on this site', () => {
	expect(safeRedirectTarget('/trip')).toBe('/trip');
	expect(safeRedirectTarget('//evil.example')).toBe('/');
	expect(safeRedirectTarget('https://evil.example')).toBe('/');
	expect(safeRedirectTarget(null)).toBe('/');
});
