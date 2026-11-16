// The language of local names per country (platform/lib/render/util.js LANG), for lang attributes.
const LANG: Readonly<Record<string, string>> = {
	china: 'zh-Hans',
	'hong-kong': 'zh-Hant',
	japan: 'ja',
	korea: 'ko',
	thailand: 'th',
	singapore: 'en-SG',
};

export const langOf = (country: string): string => LANG[country] ?? 'und';
