// End-to-end tests against the local self-hosted Convex (scripts/convex-local.sh) and the built app.
// ATR_SLOT=<1..8> runs on its own backend, port and directories (e2e/slot.ts, docs/migration/DEV.md).
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ensureTokensFile, slot } from './e2e/slot.ts';

const SLOT = slot();
ensureTokensFile(import.meta.dirname, SLOT);

// Generated local test accounts and tokens (scripts/convex-local.sh writes them; CI generates its own the same way).
for (const name of [SLOT.accountsFile, SLOT.tokensFile]) {
	const file = new URL(`./${name}`, import.meta.url);
	if (fs.existsSync(file)) process.loadEnvFile(file);
}

const BASE_URL = process.env['BASE_URL'] ?? `http://localhost:${String(SLOT.appPort)}`;
const CONVEX_URL = `http://127.0.0.1:${String(SLOT.convexPort)}`;
const CONVEX_SITE_URL = `http://127.0.0.1:${String(SLOT.convexSitePort)}`;
const CI = process.env['CI'] !== undefined;
/** CI: scripts/e2e-prepare.sh has already brought up and seeded the slot's backend and built the app. */
const PREPARED = process.env['ATR_E2E_PREPARED'] === '1';
/** The e2e content root (packages/migrate/fixtures/e2e/content): tests never depend on the real places/. */
const CONTENT_ROOT = path.resolve(
	import.meta.dirname,
	'../../packages/migrate/fixtures/e2e/content',
);

export default defineConfig({
	testDir: 'e2e',
	outputDir: SLOT.outputDir,
	timeout: 30_000,
	forbidOnly: CI,
	retries: CI ? 1 : 0,
	workers: 1,
	// CI also writes a JSON report: its durations balance the shards (e2e/shards.ts update).
	reporter: CI
		? [
				['github'],
				['html', { open: 'never', outputFolder: SLOT.reportDir }],
				['json', { outputFile: `${SLOT.outputDir}/results.json` }],
			]
		: [['list']],
	// Recording a trace for every test costs CPU the 2-core CI runners lack: CI traces the retry of a failed test.
	use: { baseURL: BASE_URL, trace: CI ? 'on-first-retry' : 'retain-on-failure' },
	projects: [
		{ name: 'setup', testMatch: /auth\.setup\.ts/ },
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
	],
	webServer: [
		...(PREPARED
			? []
			: [
					{
						name: 'convex',
						command: '../../scripts/convex-local.sh e2e-backend',
						wait: { stdout: /convex-local: e2e backend ready/ },
						timeout: 300_000,
						stdout: 'ignore' as const,
						env: { ATR_SLOT: String(SLOT.n), PUBLIC_SITE_URL: BASE_URL },
					},
				]),
		{
			name: 'web',
			command: PREPARED ? `node ${SLOT.buildDir}` : `vite build && node ${SLOT.buildDir}`,
			url: `${BASE_URL}/login`,
			timeout: 180_000,
			reuseExistingServer: !CI,
			env: {
				ATR_SLOT: String(SLOT.n),
				PORT: String(SLOT.appPort),
				HOST: '127.0.0.1',
				ORIGIN: BASE_URL,
				PUBLIC_CONVEX_URL: CONVEX_URL,
				PUBLIC_CONVEX_SITE_URL: CONVEX_SITE_URL,
				PUBLIC_SITE_URL: BASE_URL,
				// Test content, published to the slot's backend at boot with the slot's content token.
				ATR_ROOT: CONTENT_ROOT,
				ATR_CONTENT_FIXTURES: '1',
				CONTENT_TOKEN: process.env['CONTENT_TOKEN'] ?? '',
				// Lets the specs act as different client IPs (spike S12); behind Traefik this is set for real.
				ADDRESS_HEADER: 'X-Forwarded-For',
				XFF_DEPTH: '1',
			},
		},
	],
});
