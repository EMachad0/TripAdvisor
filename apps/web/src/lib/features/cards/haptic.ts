/** A short vibration where the device supports it (old haptic()): 8 ms on skip, 14 on must and maybe, 12 on a duel pick. */
export function haptic(ms: number): void {
	try {
		navigator.vibrate(ms);
	} catch {
		// No Vibration API (iOS Safari, desktop): nothing to do.
	}
}
