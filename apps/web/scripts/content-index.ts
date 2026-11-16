// Build the content index for a content root and print it, or publish it to a Convex deployment (the e2e seed and
// a manual republish). Runs with plain node (type stripping):
//   node apps/web/scripts/content-index.ts [--root <dir>] [--fixtures]                 print the index JSON
//   node apps/web/scripts/content-index.ts [--root <dir>] [--fixtures] --publish <url>  POST it to <url>/ops/content-index
// --root defaults to ATR_ROOT (else the repo); the bearer token comes from CONTENT_TOKEN in the environment and is
// never printed.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { publishContentIndex } from '../src/lib/server/content-publish.ts';
import { readContent, sourceFromEnv } from '../src/lib/server/content.ts';

const { values } = parseArgs({
	options: {
		root: { type: 'string' },
		fixtures: { type: 'boolean' },
		publish: { type: 'string' },
	},
});

const env = sourceFromEnv();
const source = {
	root: values.root === undefined ? env.root : path.resolve(values.root),
	includeFixtures: values.fixtures === true || env.includeFixtures,
};
const { index } = readContent(source);

if (values.publish === undefined) {
	process.stdout.write(`${JSON.stringify(index)}\n`);
} else {
	const token = process.env['CONTENT_TOKEN'];
	if (token === undefined || token === '') {
		process.stderr.write('content-index: CONTENT_TOKEN is not set\n');
		process.exit(1);
	}
	const result = await publishContentIndex(index, { siteUrl: values.publish, token });
	process.stdout.write(
		`content-index: ${String(index.places.length)} places, ${String(index.areas.length)} areas, ` +
			`${String(index.legs.length)} legs published (sha ${result.sha.slice(0, 12)}, ${result.changed ? 'changed' : 'unchanged'})\n`,
	);
}
