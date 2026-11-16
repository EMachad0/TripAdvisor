import type { WithElementRef, WithoutChildren } from '#lib/utils.js';
import type { HTMLTextareaAttributes } from 'svelte/elements';

/** svelte/elements types `value` as `any`; a textarea holds text. */
export type TextareaProps = WithoutChildren<
	WithElementRef<Omit<HTMLTextareaAttributes, 'value'> & { value?: string | null | undefined }>
>;
