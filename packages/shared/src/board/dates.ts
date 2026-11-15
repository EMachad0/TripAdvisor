/** Add n days to YYYY-MM-DD (UTC). Anything after the day is ignored. */
export function addDays(date: string, n: number): string {
	const d = new Date(date.slice(0, 10) + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/** The YYYY-MM-DD part of a date or stamp; '' when missing. */
export const ymd = (d: string | null | undefined): string => (d ?? '').slice(0, 10);
