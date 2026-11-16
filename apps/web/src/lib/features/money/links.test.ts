import { describe, expect, it } from 'vitest';
import { linkParts, shortUrl } from './links.ts';

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
