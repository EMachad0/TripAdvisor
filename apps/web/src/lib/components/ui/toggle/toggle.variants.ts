import { type VariantProps, tv } from 'tailwind-variants';

export const toggleVariants = tv({
	base: "group/toggle inline-flex items-center justify-center gap-1 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	variants: {
		variant: {
			default: 'bg-transparent',
			outline: 'border border-input bg-transparent shadow-xs hover:bg-muted',
			/** Filter chips: a rounded pill on the card colour; the chosen one is filled with ink. */
			pill: 'rounded-full border border-border/70 bg-card text-muted-foreground shadow-flat hover:bg-muted hover:text-foreground data-[state=on]:border-transparent data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:hover:bg-foreground data-[state=on]:hover:text-background',
			/** One option of a segmented control: sits on a pressed-in track; the chosen one is a raised card. */
			segment:
				'rounded-full text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-flat data-[state=on]:ring-1 data-[state=on]:ring-border/70',
		},
		size: {
			default:
				'h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
			sm: 'h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5',
			lg: 'h-10 min-w-10 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
		},
	},
	// A pill chip needs a little more room at its round ends than the square sizes give.
	compoundVariants: [{ variant: 'pill', class: 'px-3' }],
	defaultVariants: {
		variant: 'default',
		size: 'default',
	},
});

export type ToggleVariant = VariantProps<typeof toggleVariants>['variant'];
export type ToggleSize = VariantProps<typeof toggleVariants>['size'];
export type ToggleVariants = VariantProps<typeof toggleVariants>;
