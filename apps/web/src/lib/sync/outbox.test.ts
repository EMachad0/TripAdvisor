// The durable outbox over IndexedDB (fake-indexeddb): order, de-duplication, survival across a "reload" (a new
// outbox over the same database) and the memory fallback.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { openSyncDB } from './db';
import { durableOutbox, idbOutbox } from './outbox';
import type { OutboxEntry } from './write';

const entry = (n: number): OutboxEntry => ({
	clientOpId: `op-${String(n)}`,
	name: 'trip.write',
	args: { col: 'tasks', op: 'update', id: `t${String(n)}`, data: { status: 'done' } },
	at: `2026-11-15T12:00:0${String(n)}.000Z`,
});

beforeEach(() => {
	// A fresh IndexedDB per test.
	globalThis.indexedDB = new IDBFactory();
});

describe('idbOutbox', () => {
	test('lists entries oldest first, as plain write.ts entries', async () => {
		const box = idbOutbox(await openSyncDB());
		for (const n of [3, 1, 2]) await box.add(entry(n));
		expect(await box.list()).toEqual([entry(3), entry(1), entry(2)]);
	});

	test('adding a clientOpId that is already queued keeps one entry in its first place', async () => {
		const box = idbOutbox(await openSyncDB());
		await box.add(entry(1));
		await box.add(entry(2));
		await box.add({ ...entry(1), at: 'later' });
		expect((await box.list()).map((e) => e.clientOpId)).toEqual(['op-1', 'op-2']);
		expect((await box.list())[0]?.at).toBe(entry(1).at);
	});

	test('remove takes one entry out; removing an unknown id is a no-op', async () => {
		const box = idbOutbox(await openSyncDB());
		for (const n of [1, 2, 3]) await box.add(entry(n));
		await box.remove('op-2');
		await box.remove('nope');
		expect((await box.list()).map((e) => e.clientOpId)).toEqual(['op-1', 'op-3']);
	});

	test('entries survive a reload: a new outbox over the same database sees them in order', async () => {
		const first = durableOutbox();
		for (const n of [1, 2, 3]) await first.add(entry(n));
		await first.remove('op-1');
		const afterReload = durableOutbox();
		expect((await afterReload.list()).map((e) => e.clientOpId)).toEqual(['op-2', 'op-3']);
		await afterReload.add(entry(4));
		expect((await afterReload.list()).map((e) => e.clientOpId)).toEqual(['op-2', 'op-3', 'op-4']);
	});
});

describe('durableOutbox', () => {
	test('falls back to memory when IndexedDB cannot open', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const box = durableOutbox(() => Promise.reject(new Error('blocked')));
		await box.add(entry(1));
		await box.add(entry(2));
		await box.remove('op-1');
		expect(await box.list()).toEqual([entry(2)]);
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	test('a write made while the database is still opening is stored durably', async () => {
		let open: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => (open = resolve));
		const box = durableOutbox(async () => {
			await gate;
			return openSyncDB();
		});
		const adding = box.add(entry(1));
		open();
		await adding;
		expect(await idbOutbox(await openSyncDB()).list()).toEqual([entry(1)]);
	});
});
