// Parity: the content model, the answers and the route model against the OLD server's GET /api/state,
// GET /api/answers and GET /api/route on the same data (game/server.js createApp, run in-process on a free port).
// Two data sets: the e2e content root with the e2e feedback (verdicts, firstSeen, route edits), and the real repo
// content with no feedback. Fields that moved to Convex (verdict, note, rating, games, wins) and the card HTML
// (replaced by structured card data) are left out; every other field must be deep-equal after a JSON round trip.
import fs from 'node:fs';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { latestVerdicts } from '@atr/shared/feedback';
import type { RouteEvent } from '@atr/shared/route';
import { afterAll, describe, expect, test } from 'vitest';
import { routeFromIndex } from '../../convex/lib/logic/route';
import type { ContentIndex } from '../../convex/lib/state';
import { layoutRouteModel, withNewFlags } from '../content/derive';
import { readContent } from './content';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const E2E = path.join(ROOT, 'packages/migrate/fixtures/e2e');
const E2E_CONTENT = path.join(E2E, 'content');

interface OldApp {
	server: http.Server;
}
interface OldServer {
	createApp: (opts: Record<string, unknown>) => OldApp;
}

const tmp: string[] = [];
afterAll(() => {
	for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
});

type Json = Record<string, unknown>;
const json = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const omit = (o: Json, keys: readonly string[]): Json =>
	Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const pick = (o: Json, keys: readonly string[]): Json =>
	Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k)));

/** Run the old server on `root` with a copy of `feedback` (or none) and fetch its three read routes. */
async function oldServer(
	root: string,
	feedback: string | null,
): Promise<{ state: Json; route: Json; answers: Json[]; feedbackDir: string }> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-content-parity-'));
	tmp.push(dir);
	const feedbackDir = path.join(dir, 'feedback');
	if (feedback !== null) fs.cpSync(feedback, feedbackDir, { recursive: true });
	else fs.mkdirSync(feedbackDir);
	const mod = (await import(pathToFileURL(path.join(ROOT, 'game/server.js')).href)) as OldServer;
	const app = mod.createApp({
		root,
		configFile: path.join(root, 'config', 'trip.yaml'),
		feedbackDir,
		stateFile: path.join(feedbackDir, 'game-state.json'),
		tripDir: path.join(dir, 'trip'),
		assetsDir: path.join(dir, 'assets'),
		accounts: {},
	});
	await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
	const { port } = app.server.address() as AddressInfo;
	const get = async (p: string): Promise<unknown> =>
		(await fetch(`http://127.0.0.1:${String(port)}${p}`)).json();
	try {
		const state = (await get('/api/state')) as Json;
		const route = (await get('/api/route')) as Json;
		const answers = ((await get('/api/answers')) as { answers: Json[] }).answers;
		return { state, route, answers, feedbackDir };
	} finally {
		await new Promise((resolve) => app.server.close(resolve));
	}
}

const readJsonl = (file: string): Json[] =>
	fs.existsSync(file)
		? fs
				.readFileSync(file, 'utf8')
				.split('\n')
				.filter((l) => l.trim() !== '')
				.map((l) => JSON.parse(l) as Json)
		: [];

const FEEDBACK_ONLY = ['verdict', 'note', 'rating', 'games', 'wins', 'card'];

async function compare(root: string, feedback: string | null): Promise<void> {
	const old = await oldServer(root, feedback);
	// The old GET /api/state recorded first-seen times; the new app gets them from feedback.state.
	const gameState = JSON.parse(
		fs.readFileSync(path.join(old.feedbackDir, 'game-state.json'), 'utf8'),
	) as { firstRun: string | null; firstSeen: Record<string, string> };
	const swipes = readJsonl(path.join(old.feedbackDir, 'swipes.jsonl')) as unknown as Parameters<
		typeof latestVerdicts
	>[0];
	const verdicts = latestVerdicts(swipes);
	const { payload, index } = readContent({ root, includeFixtures: true });
	const content = json(withNewFlags(payload, { verdicts, ...gameState }, '9999-12-31T00:00:00Z'));

	const oldPlaces = old.state['places'] as Json[];
	expect(oldPlaces.length).toBeGreaterThan(5);
	expect(content.places.map((p) => p.id)).toEqual(oldPlaces.map((p) => p['id']));
	for (const [i, want] of oldPlaces.entries()) {
		const keys = Object.keys(omit(want, FEEDBACK_ONLY));
		expect(pick(content.places[i] as unknown as Json, keys), String(want['id'])).toStrictEqual(
			omit(want, FEEDBACK_ONLY),
		);
	}
	const oldAreas = old.state['areas'] as Json[];
	expect(content.areas.length).toBe(oldAreas.length);
	for (const [i, want] of oldAreas.entries()) {
		const keys = Object.keys(omit(want, FEEDBACK_ONLY));
		expect(pick(content.areas[i] as unknown as Json, keys), String(want['id'])).toStrictEqual(
			omit(want, FEEDBACK_ONLY),
		);
	}
	for (const key of ['countries', 'categories', 'interests', 'dominantShare', 'fixtures']) {
		expect(content[key as keyof typeof content], key).toStrictEqual(old.state[key]);
	}

	expect(content.answers.length).toBeGreaterThan(0);
	expect(
		content.answers.map((a) =>
			omit(a as unknown as Json, ['sources', 'tldrHtml', 'bodyHtml', 'tz']),
		),
	).toStrictEqual(old.answers.map((a) => omit(a, ['card'])));

	// Route: route.current is the backend's port over the content index and the route events.
	const events = readJsonl(path.join(old.feedbackDir, 'route.jsonl')) as unknown as RouteEvent[];
	const current = routeFromIndex(index as unknown as ContentIndex, events as never);
	expect(json(layoutRouteModel(payload, current, verdicts))).toStrictEqual(old.route);
}

describe('content model parity with the old server', () => {
	test('e2e content root with the e2e feedback (new cards, verdicts, route edits)', async () => {
		await compare(E2E_CONTENT, path.join(E2E, 'feedback'));
	});

	test('the real repo content, no feedback yet', async () => {
		await compare(ROOT, null);
	}, 60_000);
});
