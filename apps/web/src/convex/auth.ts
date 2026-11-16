// Better Auth on Convex (plan section 6): username + password, no sign-up, two seeded accounts, 400-day sliding
// sessions, a read-only guest. The component (convex.config.ts) holds the Better Auth tables.
import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import type { Auth, BetterAuthOptions } from 'better-auth';
import { betterAuth } from 'better-auth/minimal';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { username } from 'better-auth/plugins/username';
import type { HttpRouter } from 'convex/server';
import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';
import * as env from './lib/env';
import type { Role } from './tables/validators';

export const authComponent = createClient<DataModel>(components.betterAuth);

/** Better Auth routes nobody may call over HTTP (the server-side seed still uses signUpEmail). */
export const DISABLED_PATHS = [
	'/sign-up/email',
	'/update-user',
	'/change-email',
	'/is-username-available',
];

/** Account-changing routes the guest may not call (spike S11). */
export function isGuestBlockedPath(path: string): boolean {
	return path === '/change-password' || path.startsWith('/revoke-');
}

export const SESSION_EXPIRES_IN = 60 * 60 * 24 * 400;
export const SESSION_UPDATE_AGE = 60 * 60 * 24;

async function roleOf(ctx: GenericCtx<DataModel>, authUserId: string): Promise<Role | null> {
	if ('db' in ctx) {
		const member = await ctx.db
			.query('members')
			.withIndex('by_authUserId', (q) => q.eq('authUserId', authUserId))
			.unique();
		return member?.role ?? null;
	}
	return await ctx.runQuery(internal.members.roleOf, { authUserId });
}

function authOptions(ctx: GenericCtx<DataModel>) {
	return {
		baseURL: env.siteUrl(),
		secret: env.betterAuthSecret(),
		trustedOrigins: env.trustedOrigins(),
		database: authComponent.adapter(ctx),
		emailAndPassword: { enabled: true, requireEmailVerification: false },
		disabledPaths: DISABLED_PATHS,
		session: {
			expiresIn: SESSION_EXPIRES_IN,
			updateAge: SESSION_UPDATE_AGE,
			// Off on purpose (component issue #434).
			cookieCache: { enabled: false },
		},
		rateLimit: {
			enabled: true,
			storage: 'database',
			customRules: {
				'/sign-in/username': { window: 60, max: env.signInLimitPerMinute() },
				// The public JWKS: Convex fetches it to check every JWT, so the default limit (100 per 10 s) throttled
				// ordinary page loads. It only serves public keys.
				'/convex/jwks': false,
				// The JWT for a signed-in session: every page load and the browser client ask for it, and behind the
				// proxy all of them share one bucket. It needs a valid session cookie, so there is nothing to guess.
				'/convex/token': false,
			},
		},
		hooks: {
			before: createAuthMiddleware(async (mctx) => {
				if (!isGuestBlockedPath(mctx.path)) return;
				const session = await getSessionFromCtx(mctx);
				if (session !== null && (await roleOf(ctx, session.user.id)) === 'guest') {
					throw new APIError('FORBIDDEN', { message: 'The guest account is read only.' });
				}
			}),
		},
		plugins: [
			username(),
			convex({ authConfig, jwt: { expirationSeconds: env.jwtExpirationSeconds() } }),
		],
	} satisfies BetterAuthOptions;
}

/** A Better Auth instance bound to this Convex ctx (built per request). */
export function createAuth(ctx: GenericCtx<DataModel>): Auth<ReturnType<typeof authOptions>> {
	return betterAuth(authOptions(ctx));
}

/**
 * Mount the Better Auth HTTP routes (/api/auth/*) on the Convex site; http.ts calls this. The lazy variant builds
 * the auth instance per request, so pushing code does not need SITE_URL or the secret at analysis time.
 */
export function registerAuthRoutes(http: HttpRouter): void {
	authComponent.registerRoutesLazy(http, createAuth);
}
