// Reading the ConvexError codes thrown by src/convex/lib/access.ts, on the server and in the browser.
import { ConvexError } from 'convex/values';
import type { AccessErrorCode } from '#convex/lib/access.js';

export function accessErrorCode(error: unknown): AccessErrorCode | null {
	if (!(error instanceof ConvexError)) return null;
	const data: unknown = error.data;
	if (typeof data !== 'object' || data === null || !('code' in data)) return null;
	const { code } = data;
	return code === 'Unauthenticated' || code === 'Forbidden' || code === 'Frozen' ? code : null;
}

/** The `code` of any ConvexError the backend throws (access codes above, or domain codes Invalid and NoContent). */
export function errorCode(error: unknown): string | null {
	if (!(error instanceof ConvexError)) return null;
	const data: unknown = error.data;
	if (typeof data !== 'object' || data === null || !('code' in data)) return null;
	return typeof data.code === 'string' ? data.code : null;
}
