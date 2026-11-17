// Free text with its web links (old trip.js linkify and shortUrl): the text split into plain runs and links.

export type LinkPart =
	{ kind: 'text'; text: string } | { kind: 'link'; href: string; label: string };

/** "example.com/path" from "https://www.example.com/path/", at most 48 characters (old shortUrl). */
export const shortUrl = (u: string): string =>
	u
		.replace(/^https?:\/\/(www\.)?/i, '')
		.replace(/\/$/, '')
		.slice(0, 48);

export function linkParts(text: string): LinkPart[] {
	const out: LinkPart[] = [];
	let from = 0;
	for (const m of text.matchAll(/https?:\/\/[^\s<]+/g)) {
		if (m.index > from) out.push({ kind: 'text', text: text.slice(from, m.index) });
		out.push({ kind: 'link', href: m[0], label: shortUrl(m[0]) });
		from = m.index + m[0].length;
	}
	if (from < text.length) out.push({ kind: 'text', text: text.slice(from) });
	return out;
}

// Notes as lines, lists and marked values. The traveler (or an agent) writes plain text; three light marks are
// read: a line starting with "- " or "• " is a list item, `backticks` hold a code to copy (a flight number, a
// booking reference), and **stars** make a phrase strong. Dates, amounts of money and (where no timezone label
// is added) clock times are found in the text and set apart, so they can be scanned.

export type RichPart =
	| { kind: 'text'; text: string }
	| { kind: 'link'; href: string; label: string }
	/** A code to copy: a flight number, a booking reference, an approval number. */
	| { kind: 'code'; text: string }
	| { kind: 'strong'; text: string }
	/** A date, a clock time or an amount of money. */
	| { kind: 'fact'; text: string };

export type RichBlock =
	| { kind: 'line'; parts: RichPart[] }
	| { kind: 'list'; items: RichPart[][] }
	/** An empty line. */
	| { kind: 'gap' };

const MONTH =
	'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const WEEKDAY = '(?:Mon|Tues?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)(?:day)?';
/** "Jan 2", "Dec 4–6", "Nov 15, 2029". */
const MONTH_DAY = `${MONTH} \\d{1,2}(?![\\d:])(?:[–-]\\d{1,2}(?![\\d:]))?(?:, \\d{4})?`;
/** "26 Aug 2002", "2 Jan", "4–6 Dec". */
const DAY_MONTH = `\\d{1,2}(?:[–-]\\d{1,2})? ${MONTH}(?![a-z])(?: \\d{4})?`;
const DATE = `\\b(?:${WEEKDAY},? )?(?:${MONTH_DAY}|${DAY_MONTH})`;
/** "15:25", "15:25 UTC+8", "00:55 UTC+9 (+1)". */
const TIME = '\\b\\d{1,2}:\\d{2}(?!\\d)(?: UTC[+−-]\\d{1,2}(?::\\d{2})?)?(?: \\(\\+1\\))?';
const MONEY =
	'(?:R\\$|US\\$|S\\$|HK\\$|[$€¥£]|\\b(?:BRL|USD|EUR|CNY|RMB|THB|SGD|KRW|JPY|HKD)) ?\\d(?:[\\d.,]*\\d)?';

const inlinePattern = (times: boolean): RegExp =>
	new RegExp(
		[
			'(?<link>https?:\\/\\/[^\\s<]+)',
			'`(?<code>[^`\\n]+)`',
			'\\*\\*(?<strong>[^*\\n]+)\\*\\*',
			`(?<fact>${DATE}|${MONEY}${times ? `|${TIME}` : ''})`,
		].join('|'),
		'g',
	);

/** One line split into text, links, codes, strong phrases and facts. */
export function richParts(line: string, times = true): RichPart[] {
	const out: RichPart[] = [];
	let from = 0;
	for (const m of line.matchAll(inlinePattern(times))) {
		if (m.index > from) out.push({ kind: 'text', text: line.slice(from, m.index) });
		const g = m.groups ?? {};
		if (g['link'] !== undefined) {
			out.push({ kind: 'link', href: g['link'], label: shortUrl(g['link']) });
		} else if (g['code'] !== undefined) out.push({ kind: 'code', text: g['code'] });
		else if (g['strong'] !== undefined) out.push({ kind: 'strong', text: g['strong'] });
		else out.push({ kind: 'fact', text: m[0] });
		from = m.index + m[0].length;
	}
	if (from < line.length) out.push({ kind: 'text', text: line.slice(from) });
	return out;
}

/**
 * A note as blocks: lines, lists (runs of "- " or "• " lines) and gaps (empty lines). `times` false leaves clock
 * times in the text, for notes that get a timezone label after each time.
 */
export function richBlocks(text: string, times = true): RichBlock[] {
	const out: RichBlock[] = [];
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		const item = /^[-•]\s+(.*)$/.exec(line);
		const last = out.at(-1);
		if (item !== null) {
			const parts = richParts(item[1] ?? '', times);
			if (last?.kind === 'list') last.items.push(parts);
			else out.push({ kind: 'list', items: [parts] });
		} else if (line === '') {
			if (last !== undefined && last.kind !== 'gap') out.push({ kind: 'gap' });
		} else out.push({ kind: 'line', parts: richParts(line, times) });
	}
	if (out.at(-1)?.kind === 'gap') out.pop();
	return out;
}
