// Dates of the trip planner. Dates are local wall-clock strings: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM".

export const pad = (n: number | string): string => String(n).padStart(2, '0');

/** The day part of a date or stamp; '' when missing. */
export const dayKey = (s: string | null | undefined): string =>
	s !== undefined && s !== null && s !== '' ? s.slice(0, 10) : '';

/** "HH:MM" of a stamp; '' when it has no time. */
export const timeOf = (s: string | null | undefined): string =>
	/T(\d{2}:\d{2})/.exec(s ?? '')?.[1] ?? '';

const utc = (k: string): number =>
	Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));

export const addDays = (k: string, n: number): string =>
	new Date(utc(k) + n * 864e5).toISOString().slice(0, 10);
export const diffDays = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / 864e5);
export const weekday = (k: string): number => new Date(utc(k)).getUTCDay();

/** Today in the runtime's local time zone, as YYYY-MM-DD. */
export const localKey = (d: Date = new Date()): string =>
	`${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Now in the runtime's local time zone, as YYYY-MM-DDTHH:MM. */
export const localStamp = (d: Date = new Date()): string =>
	`${localKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "in 15 days", "tomorrow", "today" for a day relative to today. */
export function inDays(today: string, day: string): string {
	const n = diffDays(today, day);
	if (n === 0) return 'today';
	if (n === 1) return 'tomorrow';
	if (n > 1) return `in ${String(n)} days`;
	if (n === -1) return 'yesterday';
	return `${String(-n)} days ago`;
}
