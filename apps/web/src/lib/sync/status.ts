// What the sync badge says (pure, tested). Plan section 11: "N unsynced", "Writes paused, N waiting" and
// "Offline · last synced 14:05 UTC+8".

export interface SyncSnapshot {
	/** Writes waiting in the outbox. */
	pending: number;
	/** A write met Frozen and nothing has landed since. */
	paused: boolean;
	/** No network, or the Convex socket has been down for a while. */
	offline: boolean;
	/** Pending writes have waited long enough to be worth showing (quick writes never flash the badge). */
	slow: boolean;
}

export type BadgeKind = 'hidden' | 'paused' | 'offline' | 'unsynced';

export function badgeKind(s: SyncSnapshot): BadgeKind {
	if (s.pending > 0 && s.paused) return 'paused';
	if (s.offline) return 'offline';
	if (s.pending > 0 && s.slow) return 'unsynced';
	return 'hidden';
}

/** The short label on the pill (the full sentence is in its popover). */
export function pillText(kind: BadgeKind, pending: number): string {
	switch (kind) {
		case 'paused':
			return `Paused · ${String(pending)}`;
		case 'offline':
			return pending > 0 ? `Offline · ${String(pending)}` : 'Offline';
		case 'unsynced':
			return unsyncedText(pending);
		case 'hidden':
			return '';
	}
}

export function waitingText(pending: number): string {
	return `Writes paused, ${String(pending)} waiting`;
}

export function unsyncedText(pending: number): string {
	return `${String(pending)} unsynced`;
}

/** The local clock of an ISO instant ("14:05") and the device's UTC offset in hours (8, -3, 5.5). */
export function localClock(iso: string): { time: string; offset: number; day: string } {
	const d = new Date(iso);
	const pad = (n: number): string => String(n).padStart(2, '0');
	return {
		time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
		offset: -d.getTimezoneOffset() / 60,
		day: `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
	};
}

/** "today" or a short date ("14 Nov") for the last-synced line. */
export function dayLabel(iso: string, now: Date = new Date()): string {
	const d = new Date(iso);
	if (d.toDateString() === now.toDateString()) return '';
	return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** The JSON "Copy pending changes" puts on the clipboard: the entries as stored, oldest first. */
export function pendingJson(entries: readonly unknown[]): string {
	return JSON.stringify(entries, null, 2);
}
