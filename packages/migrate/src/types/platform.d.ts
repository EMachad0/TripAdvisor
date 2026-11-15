// Types for the plain-JS platform module the bundle test checks against (platform ships no .d.ts).
declare module '@atr/platform/lib/feedback/pull.js' {
	/** What `./atr feedback pull` finds wrong with an export bundle (empty when it accepts it). */
	export function bundleProblems(bundle: unknown): string[];
}
