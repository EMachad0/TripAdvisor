import { describe, expect, test } from 'vitest';
import { isSignInPath, LoginLimiter } from './login-limiter';

function limiter(start = 0) {
	let now = start;
	const l = new LoginLimiter({ perIp: 5, global: 30, windowMs: 600_000 }, () => now);
	return { l, advance: (ms: number) => (now += ms) };
}

describe('LoginLimiter', () => {
	test('blocks the 6th attempt from one IP after 5 failures, not another IP', () => {
		const { l } = limiter();
		for (let i = 0; i < 5; i++) {
			expect(l.isBlocked('10.0.0.1')).toBe(false);
			l.recordFailure('10.0.0.1');
		}
		expect(l.isBlocked('10.0.0.1')).toBe(true);
		expect(l.isBlocked('10.0.0.2')).toBe(false);
	});

	test('failures expire after the window', () => {
		const { l, advance } = limiter();
		for (let i = 0; i < 5; i++) l.recordFailure('a');
		advance(600_001);
		expect(l.isBlocked('a')).toBe(false);
	});

	test('the global cap blocks everyone at 30 failures', () => {
		const { l } = limiter();
		for (let i = 0; i < 30; i++) l.recordFailure(`ip-${String(i)}`);
		expect(l.isBlocked('fresh')).toBe(true);
	});
});

test('isSignInPath', () => {
	expect(isSignInPath('/api/auth/sign-in/username')).toBe(true);
	expect(isSignInPath('/api/auth/get-session')).toBe(false);
});
