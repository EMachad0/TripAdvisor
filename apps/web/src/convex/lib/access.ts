// Access wrappers (plan section 5). Every public function is built from these; lint bans the raw `query`,
// `mutation` and `action` registrars everywhere else.
//   memberQuery (alias readQuery): any signed-in member, owner or guest.
//   ownerMutation: the owner only; refuses while writes are frozen; idempotent per clientOpId.
import type { ObjectType, PropertyValidators } from 'convex/values';
import { ConvexError, v } from 'convex/values';
import type { DatabaseReader, DatabaseWriter, MutationCtx, QueryCtx } from '../_generated/server';
import { mutation, query } from '../_generated/server';
import { customQuery } from 'convex-helpers/server/customFunctions';
import type { RegisteredMutation } from 'convex/server';
import { authComponent } from '../auth';
import type { Role } from '../tables/validators';

/** The `code` of every ConvexError the wrappers throw. Clients switch on it (the outbox keeps Frozen entries). */
export type AccessErrorCode = 'Unauthenticated' | 'Forbidden' | 'Frozen';

export function accessError(
	code: AccessErrorCode,
	message: string,
): ConvexError<{
	code: AccessErrorCode;
	message: string;
}> {
	return new ConvexError({ code, message });
}

export interface Member {
	/** Better Auth user id. */
	authUserId: string;
	role: Role;
	username: string | null;
}

/** The signed-in member, or a ConvexError: Unauthenticated (no valid session) or Forbidden (no members row). */
export async function requireMember(ctx: QueryCtx): Promise<Member> {
	const user = await authComponent.safeGetAuthUser(ctx);
	if (user === undefined) throw accessError('Unauthenticated', 'Sign in first.');
	const member = await ctx.db
		.query('members')
		.withIndex('by_authUserId', (q) => q.eq('authUserId', user._id))
		.unique();
	if (member === null) throw accessError('Forbidden', 'This account has no access.');
	return { authUserId: user._id, role: member.role, username: user.username ?? null };
}

/** The write freeze used for shadow, cutover and rollback (opsFlags singleton). */
export async function writesFrozen(db: DatabaseReader): Promise<boolean> {
	const flags = await db.query('opsFlags').first();
	return flags?.writesFrozen === true;
}

/** Throws Frozen while writes are frozen, unless `force` (owner-run internal tools only, never agents). */
export async function assertWritable(
	db: DatabaseReader,
	opts?: { force?: boolean },
): Promise<void> {
	if (opts?.force === true) return;
	if (await writesFrozen(db)) {
		throw accessError('Frozen', 'Writes are paused right now. Your change is kept and will retry.');
	}
}

/** True when this clientOpId already landed (an outbox replay). */
export async function isApplied(db: DatabaseReader, clientOpId: string): Promise<boolean> {
	const row = await db
		.query('appliedOps')
		.withIndex('by_clientOpId', (q) => q.eq('clientOpId', clientOpId))
		.unique();
	return row !== null;
}

export async function recordApplied(
	db: DatabaseWriter,
	clientOpId: string,
	ts: string,
): Promise<void> {
	await db.insert('appliedOps', { clientOpId, ts });
}

/** ISO timestamp at second precision, exactly as the old server wrote `ts` (`2026-11-15T15:50:48Z`). */
export function nowTs(now: Date = new Date()): string {
	return `${now.toISOString().slice(0, 19)}Z`;
}

/**
 * The event `session` stamp: `web-` + a short hash of the Better Auth session id (at most 80 characters).
 * Server-stamped, so a client cannot fake it.
 */
export async function sessionStamp(ctx: QueryCtx): Promise<string> {
	const identity = await ctx.auth.getUserIdentity();
	const claim = identity?.['sessionId'];
	const sessionId =
		typeof claim === 'string' && claim !== '' ? claim : (identity?.subject ?? 'none');
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionId));
	const hex = Array.from(new Uint8Array(digest).slice(0, 6), (b) =>
		b.toString(16).padStart(2, '0'),
	).join('');
	return `web-${hex}`;
}

export type MemberQueryCtx = QueryCtx & { member: Member };

const memberQueryBuilder = customQuery(query, {
	args: {},
	input: async (ctx) => ({ ctx: { member: await requireMember(ctx) }, args: {} }),
});

/** A public query for any signed-in member (owner or guest). */
export const memberQuery = memberQueryBuilder;

/** The task's name for memberQuery: reads for the owner and the guest. */
export const readQuery = memberQuery;

/** What a replayed clientOpId returns instead of running the handler again. */
export interface Replayed {
	replayed: true;
}
export const REPLAYED: Replayed = { replayed: true };

export type OwnerMutationCtx = MutationCtx & {
	member: Member;
	/** The event `session` stamp for this request. */
	session: string;
	/** `ts` for rows this mutation writes (one value per mutation). */
	ts: string;
};

type UntypedArgs = Record<string, unknown>;

/**
 * A public mutation for the owner only. It takes an extra `clientOpId` arg. Order of checks: signed in and a
 * member; role owner (else Forbidden); an already-applied clientOpId returns `{ replayed: true }` without running
 * the handler (so the outbox can drain an entry that landed before a disconnect, even while frozen); writes not
 * frozen (else Frozen). On success the clientOpId is recorded in appliedOps in the same transaction.
 *
 * The return type is spelled out, not through a local alias: the generated api recovers args and return type by
 * inferring against RegisteredMutation<...>, which only works when the type is written with that alias itself.
 */
export function ownerMutation<Args extends PropertyValidators, Output>(def: {
	args: Args;
	handler: (ctx: OwnerMutationCtx, args: ObjectType<Args>) => Output | Promise<Output>;
}): RegisteredMutation<
	'public',
	ObjectType<Args> & { clientOpId: string },
	Promise<Output | Replayed>
> {
	const handler = async (ctx: MutationCtx, allArgs: UntypedArgs): Promise<Output | Replayed> => {
		const member = await requireMember(ctx);
		if (member.role !== 'owner') throw accessError('Forbidden', 'The guest account is read only.');
		const { clientOpId, ...args } = allArgs;
		if (typeof clientOpId !== 'string') throw accessError('Forbidden', 'Missing clientOpId.');
		if (await isApplied(ctx.db, clientOpId)) return REPLAYED;
		await assertWritable(ctx.db);
		const ts = nowTs();
		const session = await sessionStamp(ctx);
		// Convex has validated allArgs against { ...def.args, clientOpId }, so `args` is ObjectType<Args>.
		const typedArgs = args as ObjectType<Args>;
		const result = await def.handler({ ...ctx, member, session, ts }, typedArgs);
		await recordApplied(ctx.db, clientOpId, ts);
		return result;
	};
	// Convex types a handler's args with a conditional type over the validator, which TypeScript cannot resolve
	// for a generic `Args`; register with the untyped handler and restore the precise public signature.
	const definition = { args: { ...def.args, clientOpId: v.string() }, handler } as {
		args: PropertyValidators;
		handler: typeof handler;
	};
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- false positive: tsc rejects it without the cast (generic Args)
	return mutation(definition) as unknown as RegisteredMutation<
		'public',
		ObjectType<Args> & { clientOpId: string },
		Promise<Output | Replayed>
	>;
}
