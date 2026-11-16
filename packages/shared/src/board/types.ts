// Shapes the board maths reads. A "board place" is what the game server sends the client for one card.

export interface DayRange {
	readonly from: string;
	readonly to: string;
}

export interface Booking {
	readonly level: 'required' | 'recommended' | 'none';
	readonly lead_days?: number | null | undefined;
	readonly badge?: string | null | undefined;
	readonly links?: readonly unknown[] | null | undefined;
}

export interface BoardPlace {
	readonly id: string;
	readonly name?: string | null | undefined;
	readonly country?: string | undefined;
	readonly city?: string | undefined;
	readonly category?: string | null | undefined;
	readonly tags?: readonly string[] | undefined;
	readonly verdict?: string | null | undefined;
	readonly rating?: number | null | undefined;
	readonly games?: number | undefined;
	/** Price in R$ (a number, or text the board reads with Number()). */
	readonly brl?: number | string | null | undefined;
	/** false for places the attraction budget leaves out (food). */
	readonly budgeted?: boolean | undefined;
	readonly booking?: Booking | null | undefined;
	/** Dated places: the windows it is on. */
	readonly days?: readonly DayRange[] | undefined;
	/** Holiday ids this place is an option for. */
	readonly holidays?: readonly string[] | undefined;
}

/** A country leg of the trip config. */
export interface BoardCountry {
	readonly id: string;
	readonly name?: string | undefined;
	readonly flag?: string | undefined;
	readonly days?: number | undefined;
	readonly budget_brl_per_day?: number | undefined;
	/** YYYY-MM-DD (anything longer is cut to the day). */
	readonly from?: string | undefined;
	readonly to?: string | undefined;
}

/** Holiday id → locked place id. */
export type Locks = Readonly<Record<string, string | null | undefined>>;
