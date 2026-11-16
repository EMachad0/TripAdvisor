// Screenshots of the app at the four target devices (docs/DESIGN.md). A design aid, not a test: nothing asserts.
//
//   node apps/web/scripts/shots.ts [--base http://localhost:5187] [--out .cache/shots] [--only fold-inner,cover]
//                                [--theme light|dark|both] [--full] /trip/itinerary /money ...
//
// Signs in as the owner with the slot's generated test account (apps/web/.env.e2e.local[.s<n>], ATR_SLOT).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '../../..');

/** CSS viewports: the screen minus typical browser chrome. Keep in step with docs/DESIGN.md. */
export const DEVICES = {
	cover: { width: 384, height: 800, deviceScaleFactor: 2.8125, isMobile: true, hasTouch: true },
	'fold-inner': {
		width: 802,
		height: 790,
		deviceScaleFactor: 2.8125,
		isMobile: true,
		hasTouch: true,
	},
	macbook: { width: 1512, height: 860, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
	monitor: { width: 2560, height: 1300, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;
type DeviceName = keyof typeof DEVICES;

function arg(name: string, fallback: string): string {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}
const flags = new Set(['base', 'out', 'only', 'theme']);
const paths = process.argv.slice(2).filter((a, i, all) => {
	if (a.startsWith('--')) return false;
	const prev = all[i - 1];
	return !(prev?.startsWith('--') === true && flags.has(prev.slice(2)));
});
const base = arg('base', 'http://localhost:5187');
const out = path.resolve(ROOT, arg('out', '.cache/shots'));
const only = arg('only', Object.keys(DEVICES).join(',')).split(',') as DeviceName[];
const themeArg = arg('theme', 'light');
const themes = themeArg === 'both' ? ['light', 'dark'] : [themeArg];
const full = process.argv.includes('--full');
const slot = process.env['ATR_SLOT'] ?? '';
const accounts = path.join(
	ROOT,
	`apps/web/.env.e2e.local${slot === '' || slot === '0' ? '' : `.s${slot}`}`,
);
if (fs.existsSync(accounts)) process.loadEnvFile(accounts);
const username = process.env['E2E_OWNER_USERNAME'] ?? 'owner';
const password = process.env['E2E_OWNER_PASSWORD'] ?? '';

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
	const login = await browser.newContext();
	const page = await login.newPage();
	await page.goto(`${base}/login`);
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: /sign in/i }).click();
	await page.waitForURL((u) => !u.pathname.startsWith('/login'));
	const state = await login.storageState();
	await login.close();

	for (const name of only) {
		const device = DEVICES[name];
		for (const theme of themes) {
			const context = await browser.newContext({
				storageState: state,
				viewport: { width: device.width, height: device.height },
				deviceScaleFactor: Math.min(device.deviceScaleFactor, 2),
				isMobile: device.isMobile,
				hasTouch: device.hasTouch,
				colorScheme: theme === 'dark' ? 'dark' : 'light',
			});
			const p = await context.newPage();
			for (const route of paths.length > 0 ? paths : ['/']) {
				await p.goto(`${base}${route}`, { waitUntil: 'networkidle' }).catch(() => undefined);
				await p.waitForTimeout(700);
				const slug = route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-') || 'today';
				const file = path.join(out, `${slug}.${name}${theme === 'dark' ? '.dark' : ''}.png`);
				await p.screenshot({ path: file, fullPage: full });
				process.stdout.write(`${path.relative(ROOT, file)}\n`);
			}
			await context.close();
		}
	}
} finally {
	await browser.close();
}
