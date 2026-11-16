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
