// Fixed tables of the trip planner (port of the constants in game/lib/trip.js).

export const COLLECTIONS = [
	'tasks',
	'legs',
	'bag',
	'budget',
	'fixed',
	'spend',
	'settings',
	'days',
	'visited',
] as const;
export type Collection = (typeof COLLECTIONS)[number];

/** Rough R$ per unit of each currency, for the booking check and the spending log (the bank app shows the real one). */
export const RATES: Readonly<Record<string, number>> = {
	BRL: 1,
	USD: 5.15,
	CNY: 0.72,
	THB: 0.155,
	SGD: 4.4,
	KRW: 0.0037,
	JPY: 0.034,
	HKD: 0.66,
};

/** The traveler works 09:00–18:00 São Paulo time; this is that shift in each country's clock. */
export const SHIFT: Readonly<Record<string, string>> = {
	china: '20:00–05:00',
	'hong-kong': '20:00–05:00',
	singapore: '20:00–05:00',
	thailand: '19:00–04:00',
	korea: '21:00–06:00',
	japan: '21:00–06:00',
};

// Every time on the site is a wall-clock time local to where it happens, so each one is shown with its UTC offset.
// None of these places changes its clocks during the trip (no daylight saving), so one fixed offset each is enough.
/** Hours from UTC, by country id. */
export const TZ_OFFSET: Readonly<Record<string, number>> = {
	brazil: -3,
	turkey: 3,
	china: 8,
	'hong-kong': 8,
	singapore: 8,
	thailand: 7,
	korea: 9,
	japan: 9,
};

/** Hours from UTC, by airport (or city) code. A flight leg can override with tzStart / tzEnd. */
export const AIRPORT_TZ: Readonly<Record<string, number>> = {
	JOI: -3,
	SAO: -3,
	GRU: -3,
	CGH: -3,
	VCP: -3,
	CWB: -3,
	NVT: -3,
	FLN: -3,
	GIG: -3,
	IST: 3,
	SAW: 3,
	ADD: 3,
	DOH: 3,
	DXB: 4,
	PVG: 8,
	SHA: 8,
	PEK: 8,
	PKX: 8,
	XIY: 8,
	DYG: 8,
	CTU: 8,
	TFU: 8,
	CKG: 8,
	TXN: 8,
	HRB: 8,
	CAN: 8,
	SZX: 8,
	HKG: 8,
	MFM: 8,
	SIN: 8,
	CNX: 7,
	BKK: 7,
	DMK: 7,
	HKT: 7,
	ICN: 9,
	GMP: 9,
	PUS: 9,
	CJU: 9,
	HND: 9,
	NRT: 9,
	KIX: 9,
	ITM: 9,
	NGO: 9,
	CTS: 9,
	FUK: 9,
};

/** A dated place is an "event" when its window is short; a whole season is not something you can miss in a day. */
export const EVENT_MAX_DAYS = 14;

/** How far a place may be from the city you sleep in and still count as a day trip. */
export const NEAR_KM = 90;
