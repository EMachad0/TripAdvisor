// Parity: the backend's port of game/lib/tripstore.js writeDoc gives the same documents and refusals as the old
// JS. (Elo, the derived feedback state and the route are @atr/shared ports with their own parity tests.)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { legacy } from './legacy.node';
import * as trip from './trip';

type Json = Record<string, unknown>;

interface OldTripStore {
	writeDoc: (dir: string, req: Json) => { doc: Json | null };
	readCollection: (dir: string, col: string) => Json[];
}

const oldTripStore = await legacy<OldTripStore>('game/lib/tripstore.js');

describe('trip writes', () => {
	test('applyTripWrite follows writeDoc op by op (no form shaping)', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-trip-parity-'));
		try {
			const ops: trip.TripWriteRequest[] = [
				{ col: 'tasks', op: 'set', id: 'a', data: { title: 'A', note: 'n', order: 1 } },
				{ col: 'tasks', op: 'set', id: 'b', data: { id: 'ignored', title: 'B' } },
				{ col: 'tasks', op: 'update', id: 'a', data: { note: null, status: 'done' } },
				{ col: 'tasks', op: 'set', id: 'a', data: { title: 'A2' } },
				{ col: 'tasks', op: 'delete', id: 'zz' },
				{ col: 'tasks', op: 'delete', id: 'b' },
				{ col: 'legs', op: 'set', id: 'l1', data: { cities: null, title: 'x' } },
				{ col: 'legs', op: 'update', id: 'l1', data: { cities: ['a', 'b'] } },
			];
			const docs = new Map<string, trip.TripDoc>();
			for (const req of ops) {
				const key = (id: string): string => `${req.col}/${id}`;
				const existing =
					req.id === undefined || req.id === null ? null : (docs.get(key(req.id)) ?? null);
				const mine = trip.applyTripWrite(req, existing);
				const theirs = oldTripStore.writeDoc(dir, { ...req });
				expect(mine).toEqual(theirs.doc);
				if (mine === null && req.id !== undefined && req.id !== null) docs.delete(key(req.id));
				else if (mine !== null) docs.set(key(mine.id), mine);
			}
			for (const col of ['tasks', 'legs'] as const) {
				const mine = [...docs.entries()].filter(([k]) => k.startsWith(`${col}/`)).map(([, d]) => d);
				expect(mine).toEqual(oldTripStore.readCollection(dir, col));
			}
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test('the same bad requests are refused with the same message', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-trip-parity-'));
		try {
			const bad: trip.TripWriteRequest[] = [
				{ col: 'tasks', op: 'set', id: '-x', data: {} },
				{ col: 'tasks', op: 'set', id: 'x'.repeat(81), data: {} },
				{ col: 'tasks', op: 'set', id: 'a' },
				{ col: 'tasks', op: 'update', data: {} },
				{ col: 'tasks', op: 'delete' },
				{ col: 'tasks', op: 'update', id: 'missing', data: {} },
			];
			for (const req of bad) {
				const old = (() => {
					try {
						oldTripStore.writeDoc(dir, { ...req });
						return 'no error';
					} catch (error) {
						return (error as Error).message;
					}
				})();
				expect(() => trip.applyTripWrite(req, null)).toThrow(old);
			}
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test('new ids have the old shape', () => {
		expect(trip.newTripId(Date.UTC(2026, 10, 15), () => 0.123456789)).toMatch(/^x[0-9a-z]+$/);
	});
});
