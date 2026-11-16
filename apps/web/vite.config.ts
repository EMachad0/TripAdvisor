import { execFileSync } from 'node:child_process';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { slot } from './e2e/slot.ts';

/** The commit this build runs: GIT_SHA or Coolify's SOURCE_COMMIT, else git, else a build timestamp. */
function buildVersion(): string {
	const fromEnv = process.env['GIT_SHA'] ?? process.env['SOURCE_COMMIT'];
	if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	} catch {
		return `build-${String(Date.now())}`;
	}
}

// ATR_SLOT > 0 (parallel e2e slots, e2e/slot.ts) builds into its own directories.
const { kitOutDir, buildDir } = slot();

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Runes everywhere except dependencies (Svelte 6 makes this the default).
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
			},
			adapter: adapter({ out: buildDir }),
			outDir: kitOutDir,
			// Content pages and maps come from the platform at runtime; poll for new deploys (plan section 8). The
			// version name is the commit, which GET /healthz reports.
			version: { name: buildVersion(), pollInterval: 60_000 },
		}),
	],
	ssr: {
		// Plain JS ESM that reads files relative to its own location and ATR_ROOT; never bundle it.
		external: ['@atr/platform'],
		// TS source (no build step): always bundled, so the image never imports .ts from node_modules.
		noExternal: ['@atr/shared'],
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					// *.node.test.ts under src/convex read files (sample data) and need Node, not the Convex runtime.
					include: ['src/**/*.test.ts'],
					exclude: ['src/convex/**/!(*.node).test.ts', 'src/**/*.svelte.test.ts'],
					// routes/embed imports the embed glue's place.css?raw; Vitest stubs CSS it does not include.
					css: { include: [/\/embed\/place\.css/] },
				},
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'convex',
					environment: 'edge-runtime',
					include: ['src/convex/**/*.test.ts'],
					exclude: ['src/convex/**/*.node.test.ts'],
					server: { deps: { inline: ['convex-test'] } },
				},
			},
		],
	},
});
