import { tv, type VariantProps } from 'tailwind-variants';

export const inputGroupButtonVariants = tv({
	base: 'flex items-center gap-2 text-sm shadow-none',
	variants: {
		size: {
			xs: "h-6 gap-1 rounded-[calc(var(--radius)_-_5px)] px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
			sm: '',
			'icon-xs': 'size-6 rounded-[calc(var(--radius)_-_5px)] p-0 has-[>svg]:p-0',
			'icon-sm': 'size-8 p-0 has-[>svg]:p-0',
		},
	},
	defaultVariants: {
		size: 'xs',
	},
});

export type InputGroupButtonSize = VariantProps<typeof inputGroupButtonVariants>['size'];
