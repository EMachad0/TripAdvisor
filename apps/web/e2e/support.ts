// Shared helpers for the specs: accounts, storage state paths, and a Convex client for direct calls.
import fs from 'node:fs';
import type { APIRequestContext } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { ConvexError } from 'convex/values';

export type Account = 'owner' | 'guest';

export const STORAGE = {
	owner: 'playwright/.auth/owner.json',
	guest: 'playwright/.auth/guest.json',
} as const;

export const CONVEX_URL = 'http://127.0.0.1:3210';

/** The accounts file is written by the backend webServer (seed), possibly after the config was loaded. */
function loadAccounts(): void {
	const file = new URL('../.env.e2e.local', import.meta.url);
	if (process.env['E2E_OWNER_PASSWORD'] === undefined && fs.existsSync(file))
		process.loadEnvFile(file);
}

export function credentials(account: Account): { username: string; password: string } {
	loadAccounts();
	const prefix = account === 'owner' ? 'E2E_OWNER' : 'E2E_GUEST';
	const username = process.env[`${prefix}_USERNAME`];
	const password = process.env[`${prefix}_PASSWORD`];
	if (username === undefined || password === undefined) {
		throw new Error(`${prefix}_USERNAME/_PASSWORD missing: run scripts/convex-local.sh seed`);
	}
	return { username, password };
}

/** A distinct fake client IP per project and purpose, so in-memory limiter counts never cross. */
export function clientIp(project: string, purpose: number): string {
	const p = ['setup', 'desktop', 'pixel', 'iphone'].indexOf(project) + 1;
	return `10.${String(p)}.${String(purpose)}.1`;
}

/** The Convex JWT for the signed-in session behind `request` (what the browser client fetches). */
export async function convexToken(request: APIRequestContext): Promise<string> {
	const response = await request.get('/api/auth/convex/token');
	if (!response.ok()) throw new Error(`token request failed: ${String(response.status())}`);
	const body: unknown = await response.json();
	if (
		typeof body === 'object' &&
		body !== null &&
		'token' in body &&
		typeof body.token === 'string'
	) {
		return body.token;
	}
	throw new Error('token response has no token');
}

export function convexAs(token: string): ConvexHttpClient {
	const client = new ConvexHttpClient(CONVEX_URL);
	client.setAuth(token);
	return client;
}

/** The ConvexError code a call rejected with, or null when it succeeded. */
export async function refusalCode(call: Promise<unknown>): Promise<string | null> {
	try {
		await call;
		return null;
	} catch (error) {
		if (error instanceof ConvexError) {
			const data: unknown = error.data;
			if (
				typeof data === 'object' &&
				data !== null &&
				'code' in data &&
				typeof data.code === 'string'
			) {
				return data.code;
			}
		}
		throw error;
	}
}
