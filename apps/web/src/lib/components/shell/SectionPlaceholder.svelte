<script lang="ts">
	import * as Empty from '#lib/components/ui/empty/index.js';

	interface Props {
		title: string;
		slice: string;
	}

	let { title, slice }: Props = $props();
</script>

<svelte:head>
	<title>{title} · Asia Trip Ranker</title>
</svelte:head>

<h1 class="font-serif text-3xl font-semibold">{title}</h1>
<Empty.Root>
	<Empty.Header>
		<Empty.Title>Not built yet</Empty.Title>
		<Empty.Description>This screen arrives with slice {slice} of the migration.</Empty.Description>
	</Empty.Header>
</Empty.Root>
