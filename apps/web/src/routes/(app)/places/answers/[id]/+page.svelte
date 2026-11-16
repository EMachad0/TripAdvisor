<script lang="ts">
	import { page } from '$app/state';
	import AnswersView from '#lib/features/places/AnswersView.svelte';
</script>

<AnswersView id={page.params.id} />
