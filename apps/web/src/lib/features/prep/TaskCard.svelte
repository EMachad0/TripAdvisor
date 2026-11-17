<!--
	One task on the To do page. Closed, it is one scannable line: the tick box, the title, when it has to be done
	and how many steps are done. The title only opens and closes the task (it never ticks it); open, the task shows
	its notes and its steps, each with a box of its own. A task with steps has no box: it follows its steps, so the
	place of the box shows how many are done. Steps are added in the
	task's edit sheet (the pen). The guest sees the boxes disabled and no pen.
-->
<script lang="ts">
	import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { cn } from '#lib/utils.js';
	import Chip from '../money/Chip.svelte';
	import EditButton from '../money/EditButton.svelte';
	import RichText from '../money/RichText.svelte';
	import type { StepRow, TaskRow, When } from './model.ts';

	interface Props {
		task: TaskRow;
		open: boolean;
		canEdit: boolean;
		/** Ids of the tasks and steps with a write on its way. */
		busy: ReadonlySet<string>;
		ontoggle: (x: TaskRow | StepRow) => void;
		onopen: (open: boolean) => void;
		/** Edit the task or one of its steps. */
		onedit: (id: string) => void;
	}

	let { task, open, canEdit, busy, ontoggle, onopen, onedit }: Props = $props();

	const done = $derived(task.status === 'done');
	const hasSteps = $derived(task.steps.length > 0);
	const hasMore = $derived(task.note !== '' || hasSteps);
	const bodyId = $derived(`task-body-${task.id}`);
	const stepsLabel = $derived(
		`${String(task.stepsDone)} of ${String(task.steps.length)} steps done`,
	);
	// The ring in place of the box: the share of steps done.
	const R = 8;
	const ring = $derived(hasSteps ? (task.stepsDone / task.steps.length) * 2 * Math.PI * R : 0);
</script>

{#snippet when(w: When)}
	<span
		class={cn(
			'inline-flex items-center gap-1 text-xs font-medium nums',
			w.tone === 'late' && 'text-destructive',
			w.tone === 'soon' && 'text-amber',
			w.tone === 'open' && 'text-ink-2',
			w.tone === 'wait' && 'text-muted-foreground',
		)}
		data-testid="when"
		data-tone={w.tone}
	>
		<CalendarClockIcon class="size-3.5 shrink-0" aria-hidden="true" />{w.label}
	</span>
{/snippet}

{#snippet box(x: TaskRow | StepRow, small: boolean)}
	<Checkbox
		aria-label={`${x.status === 'done' ? 'Mark not done' : 'Mark done'}: ${x.title}`}
		class={small ? 'size-4' : 'size-5'}
		disabled={!canEdit || busy.has(x.id)}
		bind:checked={
			() => x.status === 'done',
			() => {
				ontoggle(x);
			}
		}
		bind:indeterminate={
			() => x.status === 'doing',
			() => {
				// The stored status decides; a tap only asks the parent to write.
			}
		}
	/>
{/snippet}

<li
	class={cn(
		'flex flex-col px-4 py-3 transition-colors duration-200 md:px-5',
		busy.has(task.id) && 'opacity-60',
	)}
	data-testid="check-row"
	data-id={task.id}
	data-done={done}
>
	<div class="flex items-start gap-3">
		<div class="flex h-6 w-5 shrink-0 items-center justify-center">
			{#if hasSteps}
				<svg
					class="size-5 -rotate-90"
					viewBox="0 0 20 20"
					role="img"
					aria-label={stepsLabel}
					data-testid="steps-ring"
				>
					<circle cx="10" cy="10" r={R} fill="none" stroke-width="2.5" class="stroke-border" />
					<circle
						cx="10"
						cy="10"
						r={R}
						fill="none"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-dasharray={`${String(ring)} 100`}
						class={cn('transition-all duration-300', done ? 'stroke-ok' : 'stroke-primary')}
					/>
				</svg>
			{:else}
				{@render box(task, false)}
			{/if}
		</div>
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			{#if hasMore}
				<button
					type="button"
					class="group/title -my-1 flex min-w-0 items-start gap-1.5 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-expanded={open}
					aria-controls={bodyId}
					onclick={() => {
						onopen(!open);
					}}
				>
					<span
						class={cn(
							'min-w-0 leading-6 font-medium transition-colors duration-200',
							done && 'text-muted-foreground line-through decoration-ink-3/40',
						)}>{task.title}</span
					>
					<ChevronDownIcon
						class={cn(
							'mt-1 size-4 shrink-0 text-ink-3 transition-transform duration-200 group-hover/title:text-foreground',
							open && 'rotate-180',
						)}
						aria-hidden="true"
					/>
				</button>
			{:else}
				<span
					class={cn(
						'leading-6 font-medium',
						done && 'text-muted-foreground line-through decoration-ink-3/40',
					)}>{task.title}</span
				>
			{/if}
			{#if task.when !== null || hasSteps || task.status === 'doing'}
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					{#if task.when !== null}{@render when(task.when)}{/if}
					{#if hasSteps}
						<span class="text-xs text-muted-foreground nums" data-testid="steps-count"
							>{task.stepsDone} of {task.steps.length} steps</span
						>
					{/if}
					{#if task.status === 'doing' && !hasSteps}<Chip tone="planned">In progress</Chip>{/if}
				</div>
			{/if}
		</div>
		{#if canEdit}
			<EditButton
				label={task.title}
				onclick={() => {
					onedit(task.id);
				}}
			/>
		{/if}
	</div>

	{#if open && hasMore}
		<div id={bodyId} class="mt-2 flex flex-col gap-3 pl-8" data-testid="task-body">
			{#if task.note !== ''}
				<RichText
					text={task.note}
					class={cn(
						'max-w-prose text-sm leading-relaxed text-muted-foreground',
						done && 'text-ink-3 opacity-80',
					)}
				/>
			{/if}
			{#if hasSteps}
				<ul class="flex flex-col" aria-label={`Steps: ${task.title}`}>
					{#each task.steps as s (s.id)}
						<li
							class={cn(
								'flex items-start gap-2.5 border-t border-border/60 py-2 first:border-t-0',
								busy.has(s.id) && 'opacity-60',
							)}
							data-testid="step"
							data-id={s.id}
							data-done={s.status === 'done'}
						>
							<div class="flex h-5 w-4 shrink-0 items-center justify-center">
								{@render box(s, true)}
							</div>
							<div class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span
									class={cn(
										'text-sm leading-5 font-medium',
										s.status === 'done' && 'text-muted-foreground line-through decoration-ink-3/40',
									)}>{s.title}</span
								>
								{#if s.when !== null}{@render when(s.when)}{/if}
								{#if s.note !== ''}
									<RichText
										text={s.note}
										class={cn(
											'max-w-prose text-sm leading-relaxed text-muted-foreground',
											s.status === 'done' && 'text-ink-3 opacity-80',
										)}
									/>
								{/if}
							</div>
							{#if canEdit}
								<EditButton
									label={s.title}
									onclick={() => {
										onedit(s.id);
									}}
								/>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</li>
