// Environment variables SvelteKit 3 exposes (only declared ones exist). Not static: read when the server starts,
// so a change in Coolify needs a redeploy, not a rebuild (plan section 12).
import { defineEnvVars } from '@sveltejs/kit/env';

const url = (name: string) => (value: string | undefined) => {
	if (value === undefined || value === '') throw new Error(`${name} is not set`);
	return new URL(value).origin;
};

export const variables = defineEnvVars({
	PUBLIC_CONVEX_URL: {
		public: true,
		description: 'Convex API and WebSocket origin (:3210)',
		schema: url('PUBLIC_CONVEX_URL'),
	},
	PUBLIC_CONVEX_SITE_URL: {
		public: true,
		description: 'Convex HTTP actions origin (:3211), where Better Auth runs',
		schema: url('PUBLIC_CONVEX_SITE_URL'),
	},
	CONTENT_TOKEN: {
		description:
			'Bearer token for POST /ops/content-index (its sha256 is CONTENT_TOKEN_SHA256 in Convex); unset turns content sync off',
		schema: (value: string | undefined) =>
			value === undefined || value === '' ? undefined : value,
	},
	GIT_SHA: {
		description: 'Commit this build runs (GET /healthz); defaults to the build-time version name',
		schema: (value: string | undefined) =>
			value === undefined || value === '' ? undefined : value,
	},
	PUBLIC_SITE_URL: {
		public: true,
		description: 'This app’s public origin; equals Convex SITE_URL',
		schema: url('PUBLIC_SITE_URL'),
	},
});
