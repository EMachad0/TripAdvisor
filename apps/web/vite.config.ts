import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Runes everywhere except dependencies (Svelte 6 makes this the default).
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
			},
			adapter: adapter(),
			// Content pages and maps come from the platform at runtime; poll for new deploys (plan section 8).
			version: { pollInterval: 60_000 },
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
