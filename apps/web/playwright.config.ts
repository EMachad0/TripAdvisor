// End-to-end tests against the local self-hosted Convex (scripts/convex-local.sh) and the built app.
import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Generated local test accounts (scripts/convex-local.sh seed writes them; CI generates its own the same way).
const accountsFile = new URL('./.env.e2e.local', import.meta.url);
if (fs.existsSync(accountsFile)) process.loadEnvFile(accountsFile);

const PORT = 4173;
const BASE_URL = process.env['BASE_URL'] ?? `http://localhost:${String(PORT)}`;
const CONVEX_URL = 'http://127.0.0.1:3210';
const CONVEX_SITE_URL = 'http://127.0.0.1:3211';
const CI = process.env['CI'] !== undefined;

export default defineConfig({
	testDir: 'e2e',
	timeout: 30_000,
	forbidOnly: CI,
	retries: CI ? 1 : 0,
	workers: 1,
	reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
	use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
	projects: [
		{ name: 'setup', testMatch: /auth\.setup\.ts/ },
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
		{ name: 'pixel', use: { ...devices['Pixel 7'] }, dependencies: ['setup'] },
		{ name: 'iphone', use: { ...devices['iPhone 15'] }, dependencies: ['setup'] },
	],
	webServer: [
		{
			name: 'convex',
			command: '../../scripts/convex-local.sh e2e-backend',
			wait: { stdout: /convex-local: e2e backend ready/ },
			timeout: 300_000,
			stdout: 'ignore',
		},
		{
			name: 'web',
			command: 'vite build && node build',
			url: `${BASE_URL}/login`,
			timeout: 180_000,
			reuseExistingServer: !CI,
			env: {
				PORT: String(PORT),
				HOST: '127.0.0.1',
				ORIGIN: BASE_URL,
				PUBLIC_CONVEX_URL: CONVEX_URL,
				PUBLIC_CONVEX_SITE_URL: CONVEX_SITE_URL,
				PUBLIC_SITE_URL: BASE_URL,
				// Lets the specs act as different client IPs (spike S12); behind Traefik this is set for real.
				ADDRESS_HEADER: 'X-Forwarded-For',
				XFF_DEPTH: '1',
			},
		},
	],
});
