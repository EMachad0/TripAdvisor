// Fixed vocabularies shared by schema, renderer, gaps and the game.

export const COUNTRIES = {
  china: { name: 'China', currency: 'CNY', flag: '🇨🇳', maps: 'china' },
  korea: { name: 'South Korea', currency: 'KRW', flag: '🇰🇷', maps: 'korea' },
  japan: { name: 'Japan', currency: 'JPY', flag: '🇯🇵', maps: 'global' },
  'hong-kong': { name: 'Hong Kong', currency: 'HKD', flag: '🇭🇰', maps: 'global' },
  thailand: { name: 'Thailand', currency: 'THB', flag: '🇹🇭', maps: 'global' },
  singapore: { name: 'Singapore', currency: 'SGD', flag: '🇸🇬', maps: 'global' },
};
export const COUNTRY_IDS = Object.keys(COUNTRIES);

// Balance categories from docs/GAME.md. Finer detail goes in `tags`.
export const CATEGORIES = {
  culture: { label: 'Culture', icon: '⛩', desc: 'temples, history, museums, architecture with a story' },
  food: { label: 'Food', icon: '🍜', desc: 'restaurants, street food, markets, food streets' },
  nightlife: { label: 'Nightlife', icon: '🍸', desc: 'bars, clubs, live music, night markets for drinking' },
  nature: { label: 'Nature', icon: '🏔', desc: 'parks, hikes, mountains, ice/snow, gardens that are mostly nature' },
  'odd-local': { label: 'Odd & local', icon: '🎎', desc: 'quirky, very local experiences: bathhouses, jjimjilbang, themed cafés' },
  views: { label: 'Views', icon: '🌆', desc: 'skylines, observation decks, viewpoints, striking modern architecture' },
  shopping: { label: 'Shopping', icon: '🛍', desc: 'flea markets, malls worth seeing, craft streets' },
  shows: { label: 'Shows', icon: '🎭', desc: 'performances, acrobatics, sports, festivals with a stage' },
  'day-trip': { label: 'Day trip', icon: '🚆', desc: 'a full day out of the base city' },
  stay: { label: 'Stay', icon: '🛏', desc: 'social hostels, capsule/pod hotels' },
};
export const CATEGORY_IDS = Object.keys(CATEGORIES);
/** Categories that compete for trip days (everything except `stay`). */
export const ATTRACTION_CATEGORY_IDS = CATEGORY_IDS.filter((k) => k !== 'stay');

// How well known a place is (taste goal "discovery" wants a good share of `hidden`).
export const FAME = {
  iconic: 'on every top-10 list; the traveler has surely heard of it',
  popular: 'well known to anyone who researched the city',
  hidden: 'most foreign visitors never hear of it',
};
export const FAME_IDS = Object.keys(FAME);
export const FAME_CHIP = { iconic: 'Icon', hidden: 'Hidden gem' };
export const MUST_DO_CHIP = 'On your list';

export const STAY_STYLES = { hostel: 'Hostel', capsule: 'Capsule hotel', guesthouse: 'Guesthouse', hotel: 'Hotel' };

// Trip-page `kind` (docs/TRIP.md).
export const KINDS = ['See', 'Eat', 'Do', 'Shop', 'Stay'];

export const BOOK_METHODS = {
  'passport-registered': 'Real-name booking with your passport number (common in China: WeChat mini-program or official site)',
  app: 'Booked in an app (e.g. Trip.com, Klook, Catchtable, Naver)',
  website: 'Official website booking',
  platform: 'A booking platform (Hostelworld, Booking.com, Klook, GetYourGuide…), not the venue\'s own site',
  tour: 'Only visitable with a tour / guide',
  phone: 'Phone reservation',
  'walk-in': 'No booking possible; arrive early / queue',
};
export const BOOK_METHOD_IDS = Object.keys(BOOK_METHODS);

export const CONFIDENCE = ['high', 'medium', 'low'];
export const COST_LEVELS = ['low', 'medium', 'high'];
export const CURRENCIES = ['CNY', 'KRW', 'JPY', 'HKD', 'THB', 'SGD', 'USD', 'BRL'];

export const TIP_VARIANTS = {
  insider: 'Insider tips',
  locals: 'What locals do',
  pitfalls: 'Pitfalls to avoid',
};
