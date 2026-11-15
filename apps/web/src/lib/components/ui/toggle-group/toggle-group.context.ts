import { getContext, setContext } from 'svelte';
import type { ToggleVariants } from '#lib/components/ui/toggle/index.js';

export interface ToggleGroupContext extends ToggleVariants {
	spacing?: number;
	orientation?: 'horizontal' | 'vertical';
}

const KEY = Symbol('toggleGroup');

export function setToggleGroupCtx(props: ToggleGroupContext): void {
	setContext(KEY, props);
}

export function getToggleGroupCtx(): Required<ToggleGroupContext> {
	return getContext<Required<ToggleGroupContext>>(KEY);
}
