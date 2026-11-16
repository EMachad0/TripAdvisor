import { ConvexError } from 'convex/values';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Outbox, OutboxEntry } from './write';

const mutation =
	vi.fn<(ref: unknown, args: Record<string, unknown>, opts: unknown) => Promise<unknown>>();
const toast = Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() });
vi.mock('convex-svelte', () => ({ getConvexClient: () => ({ mutation }) }));
vi.mock('svelte-sonner', () => ({ toast }));

const sync = await import('./write');

const refusal = (code: string, message = `${code} message`) => new ConvexError({ code, message });

let entries = new Map<string, OutboxEntry>();

beforeEach(() => {
	mutation.mockReset();
	toast.error.mockReset();
	toast.warning.mockReset();
	entries = new Map<string, OutboxEntry>();
	const outbox: Outbox = {
		add: (e) => {
			entries.set(e.clientOpId, e);
			return Promise.resolve();
		},
		remove: (id) => {
			entries.delete(id);
			return Promise.resolve();
		},
		list: () => Promise.resolve([...entries.values()]),
	};
	sync.setOutbox(outbox);
	sync.setWriterRole('owner');
});

describe('write', () => {
	test('stamps a fresh clientOpId, passes the optimistic update, resolves with the result', async () => {
		mutation.mockResolvedValue({ ok: true, unchanged: false, note: 'hi' });
		const optimistic = vi.fn();
		const out = await sync.write(
			'feedback.note',
			{ round: 'place', id: 'yu-garden', text: 'hi' },
			{ optimistic },
		);
		expect(out).toMatchObject({ ok: true, result: { note: 'hi' } });
		const [, args, opts] = mutation.mock.calls[0] ?? [];
		expect(args).toEqual({
			round: 'place',
			id: 'yu-garden',
			text: 'hi',
			clientOpId: out.clientOpId,
		});
		expect(out.clientOpId).toMatch(/^[0-9a-f-]{36}$/);
		// The caller's update runs inside write's wrapper (which reads through the offline mirror in the browser).
		const wrapped = (opts as { optimisticUpdate: (store: unknown) => void }).optimisticUpdate;
		const store = { getQuery: vi.fn(), getAllQueries: vi.fn(), setQuery: vi.fn() };
		wrapped(store);
		expect(optimistic).toHaveBeenCalledWith(store);
		const second = await sync.write('trip.bagUntickAll', {});
		expect(second.clientOpId).not.toBe(out.clientOpId);
		expect(get(sync.pendingCount)).toBe(0);
	});

	test('the guest is refused without a request, with the old message', async () => {
		sync.setWriterRole('guest');
		const out = await sync.write('decide.resetDays', {});
		expect(out).toMatchObject({ ok: false, reason: 'guest', message: sync.GUEST_MESSAGE });
		expect(mutation).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith(sync.GUEST_MESSAGE);
	});

	test('Frozen keeps the entry in the outbox and says writes are paused; replay sends it once unfrozen', async () => {
		mutation.mockRejectedValueOnce(refusal('Frozen'));
		const out = await sync.write('decide.setDays', { days: { china: 20 } });
		expect(out).toMatchObject({ ok: false, reason: 'frozen' });
		expect(toast.warning).toHaveBeenCalledWith(sync.FROZEN_MESSAGE);
		expect(get(sync.pendingCount)).toBe(1);
		expect(await sync.pendingEntries()).toMatchObject([
			{ clientOpId: out.clientOpId, name: 'decide.setDays', args: { days: { china: 20 } } },
		]);
		mutation.mockResolvedValueOnce({ replayed: true });
		expect(await sync.replayOutbox()).toEqual({ sent: 1, kept: 0 });
		expect(mutation.mock.calls[1]?.[1]).toMatchObject({ clientOpId: out.clientOpId });
		expect(get(sync.pendingCount)).toBe(0);
	});

	test('other refusals drop the entry and toast the server message', async () => {
		mutation.mockRejectedValueOnce(refusal('Invalid', 'unknown place id "x"'));
		const out = await sync.write('feedback.swipe', { round: 'place', id: 'x', verdict: 'must' });
		expect(out).toMatchObject({ ok: false, reason: 'invalid', message: 'unknown place id "x"' });
		expect(toast.error).toHaveBeenCalledWith('unknown place id "x"');
		expect(get(sync.pendingCount)).toBe(0);
		mutation.mockRejectedValueOnce(refusal('NoContent'));
		expect(await sync.write('route.reset', { country: 'china' }, { quiet: true })).toMatchObject({
			reason: 'invalid',
		});
		expect(toast.error).toHaveBeenCalledTimes(1);
		mutation.mockRejectedValueOnce(new Error('network down'));
		expect(await sync.write('trip.bagUntickAll', {})).toMatchObject({
			reason: 'error',
			message: 'network down',
		});
	});

	test('a write counts as pending until the mutation settles', async () => {
		let settle: (v: unknown) => void = () => undefined;
		mutation.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)));
		const done = sync.write('trip.bagUntickAll', {});
		await vi.waitFor(() => {
			expect(get(sync.pendingCount)).toBe(1);
		});
		settle({ ok: true, changed: 0 });
		await done;
		expect(get(sync.pendingCount)).toBe(0);
	});
});

const kept = (n: number): OutboxEntry => ({
	clientOpId: `kept-${String(n)}`,
	name: 'trip.write',
	args: { col: 'tasks', op: 'update', id: `t${String(n)}`, data: { status: 'done' } },
	at: '2026-11-15T12:00:00.000Z',
});

describe('replayOutbox (spike S25)', () => {
	test('entries kept from before a reload go out at once, oldest first, each with its own clientOpId', async () => {
		for (const n of [1, 2, 3]) entries.set(`kept-${String(n)}`, kept(n));
		const order: string[] = [];
		const settle: (() => void)[] = [];
		mutation.mockImplementation((_ref, args) => {
			order.push(String(args['clientOpId']));
			return new Promise((resolve) =>
				settle.push(() => {
					resolve({ ok: true });
				}),
			);
		});
		const replay = sync.replayOutbox();
		// All three are handed to the client before any resolves (the client keeps their order while offline).
		await vi.waitFor(() => {
			expect(order).toEqual(['kept-1', 'kept-2', 'kept-3']);
		});
		expect(mutation.mock.calls[0]?.[1]).toEqual({ ...kept(1).args, clientOpId: 'kept-1' });
		for (const s of settle) s();
		expect(await replay).toEqual({ sent: 3, kept: 0 });
		expect(get(sync.pendingCount)).toBe(0);
	});

	test('an entry whose write is still in flight is not sent twice', async () => {
		let settle: (v: unknown) => void = () => undefined;
		mutation.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)));
		const first = sync.write('trip.bagUntickAll', {});
		await vi.waitFor(() => {
			expect(mutation).toHaveBeenCalledTimes(1);
		});
		expect(await sync.replayOutbox()).toEqual({ sent: 0, kept: 1 });
		expect(mutation).toHaveBeenCalledTimes(1);
		settle({ ok: true, changed: 0 });
		expect((await first).ok).toBe(true);
	});

	test('a clientOpId that already landed comes back replayed and leaves the outbox', async () => {
		entries.set('kept-1', kept(1));
		mutation.mockResolvedValueOnce({ replayed: true });
		expect(await sync.replayOutbox()).toEqual({ sent: 1, kept: 0 });
		expect(mutation).toHaveBeenCalledTimes(1);
	});

	test('Frozen keeps every entry and pauses; Unauthenticated keeps them too', async () => {
		for (const n of [1, 2]) entries.set(`kept-${String(n)}`, kept(n));
		mutation.mockRejectedValue(refusal('Frozen'));
		expect(await sync.replayOutbox()).toEqual({ sent: 0, kept: 2 });
		expect(toast.error).not.toHaveBeenCalled();
		mutation.mockRejectedValue(refusal('Unauthenticated'));
		expect(await sync.replayOutbox()).toEqual({ sent: 0, kept: 2 });
		expect((await sync.pendingEntries()).map((e) => e.clientOpId)).toEqual(['kept-1', 'kept-2']);
	});

	test('a refused entry is dropped with a toast; the others still land', async () => {
		for (const n of [1, 2]) entries.set(`kept-${String(n)}`, kept(n));
		mutation.mockRejectedValueOnce(refusal('Invalid', 'unknown task "t1"'));
		mutation.mockResolvedValueOnce({ ok: true });
		expect(await sync.replayOutbox()).toEqual({ sent: 1, kept: 0 });
		expect(toast.error).toHaveBeenCalledWith(
			'A change saved offline was refused: unknown task "t1"',
		);
	});

	test("the guest never replays the owner's kept writes", async () => {
		entries.set('kept-1', kept(1));
		sync.setWriterRole('guest');
		expect(await sync.replayOutbox()).toEqual({ sent: 0, kept: 1 });
		expect(mutation).not.toHaveBeenCalled();
	});
});
