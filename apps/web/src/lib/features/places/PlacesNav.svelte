<!--
	The Places section's pages (old #subtabs row for Places): Places and Answers.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SubNav from '#lib/components/shell/SubNav.svelte';

	const path = $derived(page.url.pathname);
	const onAnswers = $derived(path === '/places/answers' || path.startsWith('/places/answers/'));
	const links = $derived([
		{ href: resolve('/(app)/places'), label: 'Places', on: !onAnswers },
		{ href: resolve('/(app)/places/answers'), label: 'Answers', on: onAnswers },
	]);
</script>

<SubNav label="Places pages" {links} />
