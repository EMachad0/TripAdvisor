// Ownership rules for mig/* branches (docs/migration/ownership.json, plan sections 9 and 17): which changed paths a
// branch may touch. Pure; scripts/check-ownership.ts feeds it git's file list.

export interface Slice {
	name: string;
	branches: string[];
	owns: string[];
}

export interface Ownership {
	shared: string[];
	integratorBranches: string[];
	unchecked: string[];
	slices: Record<string, Slice>;
}

/** A glob as a RegExp: `**` spans segments, `*` stays inside one, everything else is literal. */
export function globToRegExp(glob: string): RegExp {
	let re = '';
	for (let i = 0; i < glob.length; i++) {
		const c = glob.charAt(i);
		if (c === '*' && glob.charAt(i + 1) === '*') {
			// `**/` also matches zero segments.
			if (glob.charAt(i + 2) === '/') {
				re += '(?:.*/)?';
				i += 2;
			} else {
				re += '.*';
				i += 1;
			}
		} else if (c === '*') re += '[^/]*';
		else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
	}
	return new RegExp(`^${re}$`);
}

export const matchesAny = (path: string, globs: readonly string[]): boolean =>
	globs.some((g) => globToRegExp(g).test(path));

export type Verdict =
	| { kind: 'unchecked'; reason: string }
	| { kind: 'ok'; role: string }
	| { kind: 'fail'; role: string; outside: string[] };

/** The slice id a branch belongs to, or null. */
export function sliceOf(rules: Ownership, branch: string): string | null {
	for (const [id, s] of Object.entries(rules.slices)) if (matchesAny(branch, s.branches)) return id;
	return null;
}

/** Check a branch's changed paths against its allow-list. */
export function checkBranch(rules: Ownership, branch: string, changed: readonly string[]): Verdict {
	if (!branch.startsWith('mig/')) return { kind: 'unchecked', reason: 'not a mig/* branch' };
	if (matchesAny(branch, rules.unchecked))
		return { kind: 'unchecked', reason: `${branch} is not checked` };
	if (matchesAny(branch, rules.integratorBranches)) return { kind: 'ok', role: 'integrator' };
	const id = sliceOf(rules, branch);
	if (id === null) {
		// Another task's branch: free paths, but never the integrator's shared files.
		const outside = changed.filter((p) => matchesAny(p, rules.shared));
		return outside.length > 0
			? { kind: 'fail', role: 'task branch', outside }
			: { kind: 'ok', role: 'task branch' };
	}
	const slice = rules.slices[id];
	const owns = slice?.owns ?? [];
	const outside = changed.filter((p) => !matchesAny(p, owns) || matchesAny(p, rules.shared));
	const role = `slice ${id} (${slice?.name ?? ''})`;
	return outside.length > 0 ? { kind: 'fail', role, outside } : { kind: 'ok', role };
}
