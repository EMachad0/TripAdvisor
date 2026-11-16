<!--
	Booking check (old trip.js #t-chk and verdictHtml): is this hostel or meal within the country's daily budget?
	Reads only; the guest uses it too. The choice survives leaving the page (old T.chk), per tab.
-->
<script lang="ts" module>
	import type { CheckInput } from './model.ts';

	const chk: CheckInput = $state({ country: '', kind: 'bed', price: '', cur: '' });
</script>

<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
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
</script>

<Card.Root size="sm" data-testid="price-check">
	<Card.Header>
		<Card.Title><h3>Booking check</h3></Card.Title>
		<Card.Description>
			Is this hostel or meal within budget? Rates are approximate; the bank app shows the real one
			when you convert.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="flex flex-col gap-4">
			<Field.FieldGroup class="grid grid-cols-2 sm:grid-cols-4">
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
			<p
				role="status"
				data-testid="verdict"
				data-level={verdict.level}
				class={cn(
					'rounded-lg px-3 py-2.5 text-sm font-medium',
					verdict.level === 'ok' && 'bg-ok/15 text-ok',
					verdict.level === 'warn' && 'bg-amber/15 text-amber',
					verdict.level === 'over' && 'bg-seal/15 text-seal',
					verdict.level === 'idle' && 'bg-surface-2 text-ink-3',
				)}
			>
				{verdict.text}
			</p>
		</div>
	</Card.Content>
</Card.Root>
