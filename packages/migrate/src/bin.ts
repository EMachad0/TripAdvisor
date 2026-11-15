// Entry point: `node src/bin.ts <command> …` (Node 24 strips the types). The app's Convex sources, which the
// import loads for the schema, use extensionless relative imports (bundler style); this hook resolves those to
// their .ts file so plain node can load them. Nothing else is rewritten.
import { registerHooks } from 'node:module';

registerHooks({
	resolve(specifier, context, nextResolve) {
		try {
			return nextResolve(specifier, context);
		} catch (error) {
			const relative = specifier.startsWith('./') || specifier.startsWith('../');
			if (!relative || /\.[cm]?[jt]s$/.test(specifier)) throw error;
			return nextResolve(`${specifier}.ts`, context);
		}
	},
});

const { main } = await import('./cli.ts');
process.exitCode = await main(process.argv.slice(2));
