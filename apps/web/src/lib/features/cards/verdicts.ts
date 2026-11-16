// The three calls on a card with their labels, deck keys and icons (old game.js VERDICTS). Shared by the deck, the
// place sheet, My calls, the board and the holiday picker.
import CircleHelp from '@lucide/svelte/icons/circle-question-mark';
import Heart from '@lucide/svelte/icons/heart';
import X from '@lucide/svelte/icons/x';
import type { Component } from 'svelte';
import type { Verdict } from './model.ts';

export * from './model.ts';

export interface VerdictInfo {
	label: string;
	/** The deck's keyboard key, as shown. */
	key: string;
	icon: Component;
}

export const VERDICTS: Readonly<Record<Verdict, VerdictInfo>> = {
	skip: { label: 'Skip', key: '←', icon: X },
	maybe: { label: 'Maybe', key: '↑', icon: CircleHelp },
	must: { label: 'Must', key: '→', icon: Heart },
};
