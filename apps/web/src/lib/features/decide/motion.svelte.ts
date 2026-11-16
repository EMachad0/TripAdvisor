// prefers-reduced-motion as a reactive value (false during SSR): every Decide animation reads it, as the old
// `reduced` constant in game.js did.
import { MediaQuery } from 'svelte/reactivity';

export const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce');
