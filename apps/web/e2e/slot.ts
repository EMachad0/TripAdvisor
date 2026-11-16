// Parallel test slots (docs/migration/DEV.md): ATR_SLOT=<0..8> gives a run its own Convex backend (compose
// project, volume, ports), app port, env files, build output and Playwright directories, so several agents can run
// e2e on one laptop at once. Slot 0 is the plain setup (today's ports and file names). The same numbers live in
// scripts/convex-local.sh; keep the two in step.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_SLOT = 8;

/** The slot from ATR_SLOT (unset or empty: 0). Throws on anything but 0..8. */
export function slotFromEnv(raw: string | undefined = process.env['ATR_SLOT']): number {
	if (raw === undefined || raw === '') return 0;
	if (!/^\d$/.test(raw) || Number(raw) > MAX_SLOT) {
		throw new Error(`ATR_SLOT must be a whole number from 0 to ${String(MAX_SLOT)}, got "${raw}"`);
	}
	return Number(raw);
}

export interface Slot {
	n: number;
	/** '' for slot 0, else `.s<n>`: appended to the env file names. */
	suffix: string;
	/** Convex API and WebSocket port (3210 + 10n). */
	convexPort: number;
	/** Convex HTTP actions port (3211 + 10n). */
	convexSitePort: number;
	/** The built app's port under Playwright (4173 + n). */
	appPort: number;
	/** apps/web-relative paths. */
	authDir: string;
	outputDir: string;
	reportDir: string;
	/** SvelteKit outDir and adapter-node output, so two slots in one checkout never overwrite each other's build. */
	kitOutDir: string;
	buildDir: string;
	/** Env files written by scripts/convex-local.sh (gitignored, mode 600). */
	accountsFile: string;
	tokensFile: string;
	keyFile: string;
}

export function slot(n: number = slotFromEnv()): Slot {
	const s = n === 0 ? '' : `-s${String(n)}`;
	const suffix = n === 0 ? '' : `.s${String(n)}`;
	return {
		n,
		suffix,
		convexPort: 3210 + 10 * n,
		convexSitePort: 3211 + 10 * n,
		appPort: 4173 + n,
		authDir: `playwright/.auth${s}`,
		outputDir: `test-results${s}`,
		reportDir: `playwright-report${s}`,
		kitOutDir: `.svelte-kit${s}`,
		buildDir: `build${s}`,
		accountsFile: `.env.e2e.local${suffix}`,
		tokensFile: `.env.tokens.local${suffix}`,
		keyFile: `.env.convex-local${suffix}`,
	};
}

/**
 * The slot's token file (CONTENT_TOKEN for POST /ops/content-index, EXPORT_TOKEN for GET /ops/export), created with
 * fresh random tokens when missing (mode 600). scripts/convex-local.sh init-env puts their sha256 in the slot's
 * Convex env. Returns the file's path.
 */
export function ensureTokensFile(webDir: string, s: Slot = slot()): string {
	const file = path.join(webDir, s.tokensFile);
	if (!fs.existsSync(file)) {
		const token = (): string => crypto.randomBytes(24).toString('base64url');
		fs.writeFileSync(file, `CONTENT_TOKEN=${token()}\nEXPORT_TOKEN=${token()}\n`, {
			mode: 0o600,
			flag: 'wx',
		});
	}
	return file;
}
