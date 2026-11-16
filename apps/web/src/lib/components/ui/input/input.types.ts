import type { WithElementRef } from '#lib/utils.js';
import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

/** svelte/elements types `value` as `any`; these inputs hold text or numbers. */
export type InputValue = string | number | null | undefined;

export type InputProps = WithElementRef<
	Omit<HTMLInputAttributes, 'type' | 'value'> & { value?: InputValue } & (
			{ type: 'file'; files?: FileList | null } | { type?: InputType; files?: undefined }
		)
>;
