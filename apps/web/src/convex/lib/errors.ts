// Domain errors the feature functions throw. Access errors (Unauthenticated, Forbidden, Frozen) live in
// access.ts; these cover bad input (the old server's 400s) and a missing content index.
import { ConvexError } from 'convex/values';

export type DomainErrorCode =
	/** Bad input: the old server answered 400 with this message. */
	| 'Invalid'
	/** trip-web has not published the content index yet, so ids cannot be checked. */
	| 'NoContent';

export function domainError(
	code: DomainErrorCode,
	message: string,
): ConvexError<{ code: DomainErrorCode; message: string }> {
	return new ConvexError({ code, message });
}

export const invalid = (message: string): ConvexError<{ code: DomainErrorCode; message: string }> =>
	domainError('Invalid', message);
