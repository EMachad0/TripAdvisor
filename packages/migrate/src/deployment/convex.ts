// A real Convex deployment, reached with its admin key (plan section 14: atomic per table).
// - Reads page through the backend's system query `_system/cli/tableData` over HTTP (what `npx convex data`
//   uses), in creation order.
// - Writes run `convex import --table <t> --replace` (the CLI's admin import, one atomic replace per table) with
//   the URL and key passed in the child's environment only. The rows file lives in a private temp dir (mode 700)
//   that is deleted right after.
// The key is never logged, printed or put on a command line.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { isObject, prop, type Json, type JsonObject } from '../json.ts';
import type { DataTable } from '../tables.ts';
import type { Deployment } from './types.ts';

const run = promisify(execFile);
const PAGE = 1000;

export interface ConvexTarget {
	url: string;
	adminKey: string;
}

/**
 * A value in Convex's encoded JSON, checked to be plain JSON. Only int64, bytes and non-finite floats are encoded
 * as `{"$type": …}` objects; none can come from a v1 file, and user field names cannot start with "$".
 */
function plainJson(value: Json): Json {
	if (Array.isArray(value)) return value.map(plainJson);
	if (!isObject(value)) return value;
	const out: JsonObject = {};
	for (const [key, inner] of Object.entries(value)) {
		if (key.startsWith('$')) throw new Error(`encoded ${key} value in a data table`);
		out[key] = plainJson(inner);
	}
	return out;
}

function convexCli(): string {
	return path.join(
		path.dirname(createRequire(import.meta.url).resolve('convex/package.json')),
		'bin',
		'main.js',
	);
}

export class ConvexAdmin implements Deployment {
	readonly label: string;
	private readonly target: ConvexTarget;

	constructor(target: ConvexTarget) {
		this.target = target;
		this.label = new URL(target.url).host;
	}

	private async systemQuery(fn: string, args: JsonObject): Promise<Json> {
		const res = await fetch(new URL('/api/query', this.target.url), {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Convex ${this.target.adminKey}`,
			},
			body: JSON.stringify({ path: fn, format: 'convex_encoded_json', args: [args] }),
		});
		const body: unknown = await res.json().catch(() => null);
		if (!res.ok || !isObject(body) || body['status'] !== 'success' || body['value'] === undefined) {
			const message = prop(body, 'errorMessage');
			const detail = typeof message === 'string' ? `: ${message}` : '';
			throw new Error(`${fn} on ${this.label} failed (HTTP ${String(res.status)})${detail}`);
		}
		return plainJson(body['value']);
	}

	readTable(table: DataTable): Promise<JsonObject[]> {
		return this.readAnyTable(table);
	}

	private async readAnyTable(table: string): Promise<JsonObject[]> {
		const docs: JsonObject[] = [];
		let cursor: string | null = null;
		for (;;) {
			const page = await this.systemQuery('_system/cli/tableData', {
				table,
				order: 'asc',
				paginationOpts: { numItems: PAGE, cursor },
			});
			if (!isObject(page) || !Array.isArray(page['page']))
				throw new Error(`bad tableData page for ${table}`);
			for (const doc of page['page']) if (isObject(doc)) docs.push(doc);
			const next = page['continueCursor'];
			if (page['isDone'] === true || typeof next !== 'string') return docs;
			cursor = next;
		}
	}

	async replaceTable(table: DataTable, rows: readonly JsonObject[]): Promise<void> {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atr-migrate-'));
		try {
			// The CLI insists on running from a project root; a package.json that names convex is enough.
			await fs.writeFile(
				path.join(dir, 'package.json'),
				'{"private":true,"dependencies":{"convex":"*"}}\n',
			);
			const file = path.join(dir, `${table}.jsonl`);
			await fs.writeFile(file, rows.map((row) => `${JSON.stringify(row)}\n`).join(''), {
				mode: 0o600,
			});
			await run(
				process.execPath,
				[
					convexCli(),
					'import',
					'--table',
					table,
					'--replace',
					'--yes',
					'--format',
					'jsonLines',
					file,
				],
				{
					cwd: dir,
					env: {
						PATH: process.env['PATH'] ?? '',
						HOME: process.env['HOME'] ?? dir,
						CONVEX_SELF_HOSTED_URL: this.target.url,
						CONVEX_SELF_HOSTED_ADMIN_KEY: this.target.adminKey,
					},
					maxBuffer: 16 * 1024 * 1024,
				},
			).catch((error: unknown) => {
				const stderr = prop(error, 'stderr');
				const tail =
					typeof stderr === 'string' ? stderr.trim().split('\n').slice(-3).join(' ') : '';
				throw new Error(`import of ${table} into ${this.label} failed: ${tail}`);
			});
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	}

	async writesFrozen(): Promise<boolean> {
		const flags = await this.readAnyTable('opsFlags');
		return flags.some((f) => f['writesFrozen'] === true);
	}
}
