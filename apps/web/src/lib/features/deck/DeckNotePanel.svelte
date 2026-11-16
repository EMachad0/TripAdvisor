<!--
	The deck's note panel (old toggleDeckNote): it takes the place of the top card's text (below the photo on a phone,
	beside it from md up), with "Your note on <name>", Done, and the note editor. The deck ignores pointer presses
	that start in it (data-deck-note), so typing or tapping here never starts a drag or opens the card.
-->
<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import NoteEditor from '#lib/features/cards/NoteEditor.svelte';
	import type { Round } from '#lib/features/cards/model.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		round: Round;
		id: string;
		name: string;
		short: string;
		onclose: () => void;
	}

	let { round, id, name, short, onclose }: Props = $props();
</script>

<div
	role="group"
	aria-label={`Note on ${name}`}
	data-deck-note
	class={cn(
		'absolute inset-x-0 bottom-0 z-40 flex animate-in flex-col gap-2 rounded-b-2xl border-t border-border bg-card p-3 shadow-soft fade-in-0 md:inset-y-0 md:right-0 md:rounded-l-none md:rounded-r-2xl md:border-t-0 md:border-l md:p-4',
		round === 'area' ? 'top-2/5 md:left-5/12' : 'top-1/2 md:left-1/2',
	)}
>
	<div class="flex items-center justify-between gap-2 text-sm text-muted-foreground">
		<span class="truncate">Your note on <b class="text-foreground">{short}</b></span>
		<Button variant="ghost" size="sm" onclick={onclose}>Done</Button>
	</div>
	<div class="min-h-0 flex-1">
		<NoteEditor
			{round}
			{id}
			{name}
			variant="deck"
			autofocus
			ondone={onclose}
			placeholder={`Why this call? e.g. ${round === 'area' ? '“Must, but only if I go in January”' : '“Only if it’s not raining”'}. Saves as you type; the curator reads it too.`}
		/>
	</div>
</div>
