import { describe, expect, it } from 'vitest';
import { linkParts, richBlocks, richParts, shortUrl } from './links.ts';

describe('linkParts', () => {
	it('splits text around web links, with short labels', () => {
		expect(linkParts('Pay with Alipay: https://www.alipay.com/intl/ then top up.')).toEqual([
			{ kind: 'text', text: 'Pay with Alipay: ' },
			{ kind: 'link', href: 'https://www.alipay.com/intl/', label: 'alipay.com/intl' },
			{ kind: 'text', text: ' then top up.' },
		]);
		expect(linkParts('no links')).toEqual([{ kind: 'text', text: 'no links' }]);
		expect(linkParts('')).toEqual([]);
	});
	it('cuts long labels at 48 characters', () => {
		expect(shortUrl(`http://example.com/${'a'.repeat(60)}`)).toHaveLength(48);
	});
});

describe('richParts', () => {
	const kinds = (line: string, times = true) =>
		richParts(line, times)
			.filter((p) => p.kind !== 'text')
			.map((p) => [p.kind, 'text' in p ? p.text : p.label]);

	it('finds dates, with a weekday, a range or a year', () => {
		expect(
			kinds('Opens Wed Dec 30, flight on Sat Jan 2. Paid Nov 10; Dec 4–6; Nov 15, 2029.'),
		).toEqual([
			['fact', 'Wed Dec 30'],
			['fact', 'Sat Jan 2'],
			['fact', 'Nov 10'],
			['fact', 'Dec 4–6'],
			['fact', 'Nov 15, 2029'],
		]);
		expect(kinds('Dose 26 Aug 2002 (Fiocruz), trip Sat 2 Jan, 4–6 Dec')).toEqual([
			['fact', '26 Aug 2002'],
			['fact', 'Sat 2 Jan'],
			['fact', '4–6 Dec'],
		]);
	});

	it('does not take a word that only starts like a month', () => {
		expect(kinds('Marriott 5 stars, Mayor 2, Decide 3, Sunny 10')).toEqual([]);
	});

	it('finds money and clock times; times stay in the text when asked', () => {
		expect(kinds('R$ 774,89 by card. KRW 10,000 fee. Lands 17:15 UTC+7.')).toEqual([
			['fact', 'R$ 774,89'],
			['fact', 'KRW 10,000'],
			['fact', '17:15 UTC+7'],
		]);
		expect(kinds('Lands 17:15, pay US$7', false)).toEqual([['fact', 'US$7']]);
	});

	it('reads codes, strong phrases and links', () => {
		expect(
			richParts('West Air `PN6595`, **official site only**: https://www.k-eta.go.kr/'),
		).toEqual([
			{ kind: 'text', text: 'West Air ' },
			{ kind: 'code', text: 'PN6595' },
			{ kind: 'text', text: ', ' },
			{ kind: 'strong', text: 'official site only' },
			{ kind: 'text', text: ': ' },
			{ kind: 'link', href: 'https://www.k-eta.go.kr/', label: 'k-eta.go.kr' },
		]);
	});
});

describe('richBlocks', () => {
	it('groups list lines, keeps one gap between paragraphs and drops the edges', () => {
		const blocks = richBlocks('Have ready:\n- passport\n• hotel address\n\n\nThen save it.\n');
		expect(blocks.map((b) => b.kind)).toEqual(['line', 'list', 'gap', 'line']);
		expect(blocks[1]).toMatchObject({
			items: [[{ text: 'passport' }], [{ text: 'hotel address' }]],
		});
	});

	it('has nothing for an empty note', () => {
		expect(richBlocks('')).toEqual([]);
	});
});
