// Country vocabulary (port of COUNTRIES in platform/lib/schema/enums.js). The other platform vocabularies
// (categories, fame, booking methods) belong to the curator and stay there.

export interface CountryInfo {
	readonly name: string;
	readonly currency: string;
	readonly flag: string;
	readonly maps: 'china' | 'korea' | 'global';
}

export const COUNTRIES = {
	china: { name: 'China', currency: 'CNY', flag: '🇨🇳', maps: 'china' },
	korea: { name: 'South Korea', currency: 'KRW', flag: '🇰🇷', maps: 'korea' },
	japan: { name: 'Japan', currency: 'JPY', flag: '🇯🇵', maps: 'global' },
	'hong-kong': { name: 'Hong Kong', currency: 'HKD', flag: '🇭🇰', maps: 'global' },
	thailand: { name: 'Thailand', currency: 'THB', flag: '🇹🇭', maps: 'global' },
	singapore: { name: 'Singapore', currency: 'SGD', flag: '🇸🇬', maps: 'global' },
} as const satisfies Readonly<Record<string, CountryInfo>>;

export type CountryId = keyof typeof COUNTRIES;
/** The keys of COUNTRIES, in order. */
export const COUNTRY_IDS = [
	'china',
	'korea',
	'japan',
	'hong-kong',
	'thailand',
	'singapore',
] as const satisfies readonly CountryId[];
