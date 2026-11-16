// The one place Convex functions read deployment env (plan section 5: @convex-dev/no-process-env cannot see this
// layout, so every read goes through here). Values are set with scripts/convex-local.sh or scripts/convex-prod.sh.

function optional(name: string): string | undefined {
	const value = process.env[name];
	return value === undefined || value === '' ? undefined : value;
}

function required(name: string): string {
	const value = optional(name);
	if (value === undefined) throw new Error(`Convex env ${name} is not set`);
	return value;
}

/** The app origin (trip-web), e.g. https://new.<site>. Better Auth's baseURL. */
export function siteUrl(): string {
	return required('SITE_URL');
}

/** SITE_URL plus TRUSTED_ORIGINS (a comma list of exact origins, no wildcards). */
export function trustedOrigins(): string[] {
	const extra = (optional('TRUSTED_ORIGINS') ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.filter((origin) => origin !== '');
	return [...new Set([siteUrl(), ...extra])];
}

/** Lifetime of the Convex JWT (seconds). 900 by default; spike S9 runs with a short one. */
export function jwtExpirationSeconds(): number {
	const raw = optional('JWT_EXPIRATION_SECONDS');
	if (raw === undefined) return 900;
	const seconds = Number(raw);
	if (!Number.isInteger(seconds) || seconds < 30) {
		throw new Error('JWT_EXPIRATION_SECONDS must be a whole number of seconds, at least 30');
	}
	return seconds;
}

export interface SeedAccount {
	username: string;
	password: string;
}

/** Temporary seed credentials (section 6): set from stdin, removed right after the seed runs. */
export function seedAccounts(): { owner: SeedAccount; guest: SeedAccount } {
	return {
		owner: {
			username: optional('SEED_OWNER_USERNAME') ?? 'eliton',
			password: required('SEED_OWNER_PASSWORD'),
		},
		guest: {
			username: optional('SEED_GUEST_USERNAME') ?? 'guest',
			password: required('SEED_GUEST_PASSWORD'),
		},
	};
}

/** True only on CI and local test deployments (ATR_CI_DEPLOYMENT=1); never set on prod. */
export function isCiDeployment(): boolean {
	return optional('ATR_CI_DEPLOYMENT') === '1';
}

/** Password of the CI-only `ci_restore` owner (restore test, section 13). */
export function ciOwnerPassword(): string {
	return required('E2E_OWNER_PASSWORD');
}

/** Better Auth's signing and encryption secret. */
export function betterAuthSecret(): string {
	return required('BETTER_AUTH_SECRET');
}

/**
 * Better Auth's backstop limit on /sign-in/username, per 60 s (section 6, layer 2). Behind the SvelteKit proxy
 * Better Auth sees no client IP, so this is one shared bucket. 5 in production; test deployments raise it so a
 * Playwright run that signs in many times does not trip it.
 */
export function signInLimitPerMinute(): number {
	const raw = optional('AUTH_SIGNIN_LIMIT_PER_MINUTE');
	if (raw === undefined) return 5;
	const max = Number(raw);
	if (!Number.isInteger(max) || max < 1) {
		throw new Error('AUTH_SIGNIN_LIMIT_PER_MINUTE must be a positive whole number');
	}
	return max;
}

/** sha256 (lowercase hex) of the bearer token trip-web sends to POST /ops/content-index; unset disables it. */
export function contentTokenSha256(): string | undefined {
	return optional('CONTENT_TOKEN_SHA256')?.toLowerCase();
}

/** sha256 (lowercase hex) of the curator token for GET /ops/export; unset disables the route. */
export function exportTokenSha256(): string | undefined {
	return optional('EXPORT_TOKEN_SHA256')?.toLowerCase();
}
