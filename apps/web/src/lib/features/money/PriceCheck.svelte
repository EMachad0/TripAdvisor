<!--
	Booking check (old trip.js #t-chk and verdictHtml): is this hostel or meal within the country's daily budget?
	Reads only; the guest uses it too. The choice survives leaving the page (old T.chk), per tab.
-->
<script lang="ts" module>
	import type { CheckInput } from './model.ts';

	const chk: CheckInput = $state({ country: '', kind: 'bed', price: '', cur: '' });
</script>

<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import ScaleIcon from '@lucide/svelte/icons/scale';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { cn } from '#lib/utils.js';
	import {
		CHECK_KINDS,
		CURRENCIES,
		checkDefaults,
		checkVerdict,
		type BudgetRow,
		type CheckKind,
	} from './model.ts';

	interface Props {
		rows: readonly BudgetRow[];
		current: BudgetRow | null;
	}

	let { rows, current }: Props = $props();

	$effect.pre(() => {
		const next = checkDefaults(chk, rows, current);
		if (next !== chk) Object.assign(chk, next);
	});

	const verdict = $derived(checkVerdict(rows, chk));
	const isKind = (s: unknown): s is CheckKind => s === 'bed' || s === 'food' || s === 'other';
	const ICON = {
		idle: ScaleIcon,
		ok: CircleCheckIcon,
		warn: CircleAlertIcon,
		over: CircleXIcon,
	} as const;
	const VerdictIcon = $derived(ICON[verdict.level]);
</script>

<section
	class="@container flex flex-col gap-4 panel p-5 md:p-6"
	data-testid="price-check"
	aria-labelledby="price-check-title"
>
	<header>
		<h2 id="price-check-title" class="font-serif text-xl font-semibold">Booking check</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			Is this hostel or meal within budget? Rates are approximate; the bank app shows the real one
			when you convert.
		</p>
	</header>
	<Field.FieldGroup class="grid grid-cols-2 @xl:grid-cols-4">
		<Field.Field>
			<Field.FieldLabel for="chk-country">Country</Field.FieldLabel>
			<NativeSelect.Root
				id="chk-country"
				class="w-full"
				bind:value={
					() => chk.country,
					(v) => {
						chk.country = String(v ?? '');
						const b = rows.find((x) => x.country === chk.country);
						if (b !== undefined && b.currency !== '') chk.cur = b.currency;
					}
				}
			>
				{#each rows as b (b.id)}
					<NativeSelect.Option value={b.country}>{b.name}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</Field.Field>
		<Field.Field>
			<Field.FieldLabel for="chk-kind">What</Field.FieldLabel>
			<NativeSelect.Root
				id="chk-kind"
				class="w-full"
				bind:value={
					() => chk.kind,
					(v) => {
						if (isKind(v)) chk.kind = v;
					}
				}
			>
				{#each CHECK_KINDS as k (k.id)}
					<NativeSelect.Option value={k.id}>{k.label}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</Field.Field>
		<Field.Field>
			<Field.FieldLabel for="chk-price">Price</Field.FieldLabel>
			<Input
				id="chk-price"
				type="number"
				min="0"
				step="any"
				inputmode="decimal"
				placeholder="e.g. 120"
				bind:value={
					() => chk.price, (v) => (chk.price = v === null || v === undefined ? '' : String(v))
				}
			/>
		</Field.Field>
		<Field.Field>
			<Field.FieldLabel for="chk-cur">Currency</Field.FieldLabel>
			<NativeSelect.Root
				id="chk-cur"
				class="w-full"
				bind:value={() => chk.cur, (v) => (chk.cur = String(v ?? 'BRL'))}
			>
				{#each CURRENCIES as c (c)}
					<NativeSelect.Option value={c}>{c}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</Field.Field>
	</Field.FieldGroup>
	<div
		class={cn(
			'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors duration-200',
			verdict.level === 'ok' && 'bg-ok/12 text-ok',
			verdict.level === 'warn' && 'bg-amber/14 text-amber',
			verdict.level === 'over' && 'bg-seal/12 text-seal',
			verdict.level === 'idle' && 'bg-muted/70 text-muted-foreground',
		)}
	>
		<VerdictIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
		<p role="status" data-testid="verdict" data-level={verdict.level}>{verdict.text}</p>
	</div>
</section>
