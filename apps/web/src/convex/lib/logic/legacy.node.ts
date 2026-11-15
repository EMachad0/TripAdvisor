// Loads the old plain-JS modules (game/lib, platform/lib) for the parity specs. They have no type declarations,
// so each spec states the slice of the old API it calls. Node only (two dots: never bundled by Convex).
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The repository root (apps/web/src/convex/lib/logic -> six levels up). */
export const ROOT = path.resolve(import.meta.dirname, '../../../../../..');

/** Import a module of the old code by repo-relative path, typed by the caller. */
export async function legacy<T>(rel: string): Promise<T> {
	const mod: unknown = await import(pathToFileURL(path.join(ROOT, rel)).href);
	return mod as T;
}
