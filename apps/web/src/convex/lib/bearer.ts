// Bearer tokens for the ops routes. Convex env holds only each token's sha256, so a leaked env listing does not
// leak a usable token; the comparison runs in constant time over the hex digests.
import { sha256Hex } from './sha256';

export type BearerCheck = 'ok' | 'disabled' | 'unauthorized';

/** The token of an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(header: string | null): string | null {
	const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
	return match?.[1] ?? null;
}

/** Equal-length strings compared without an early exit. */
export function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** Check a request's bearer token against an expected sha256 (undefined: the route is switched off). */
export async function checkBearer(
	request: Request,
	expectedSha256: string | undefined,
): Promise<BearerCheck> {
	if (expectedSha256 === undefined) return 'disabled';
	const token = bearerToken(request.headers.get('Authorization'));
	if (token === null) return 'unauthorized';
	return constantTimeEqual(await sha256Hex(token), expectedSha256) ? 'ok' : 'unauthorized';
}
