<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import AppShell from '#lib/components/shell/AppShell.svelte';
	import { useContentRefresh } from '#lib/components/shell/refresh.svelte.js';
	import { setAppData } from '#lib/content/app-data.svelte.js';
	import { contentKeys, keysToTrack } from '#lib/content/derive.js';
	import { hashTarget } from '#lib/components/shell/hash-links.js';
	import { DecideData } from '#lib/features/decide/data.svelte.js';
	import { useTrip } from '#lib/features/money/trip-query.svelte.js';
	import { openTasks } from '#lib/features/prep/model.js';
	import { setWriterRole, write } from '#lib/sync/write.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const app = setAppData(() => data);
	$effect.pre(() => {
		setWriterRole(data.me.role);
	});
	useContentRefresh(() => contentKeys(app.content));

	// Old hash links (#/calendar/<d>, #/places/<a+b>, #/home ...) open the new path; plan section 8.
	onMount(() => {
		const target = hashTarget(location.hash);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- hashTarget builds paths of existing routes from the old hash
		if (target !== null) void goto(target, { replaceState: true });
	});

	// Section badges (old secBadge): Decide counts what is left to call, Prep the open tasks.
	const decide = new DecideData();
	const trip = useTrip();
	const badges = $derived({
		'/decide': decide.counts.areasLeft + decide.counts.placesLeft + decide.counts.holidayOpen,
		'/prep': openTasks(trip.data),
	});

	// First-seen bookkeeping (the old GET /api/state wrote it on read): once feedback has loaded, the owner's
	// client records keys it has not seen yet. Guests never write. One call per content version.
	let trackedVersion: string | null = null;
	$effect(() => {
		const feedback = app.feedback;
		if (app.isGuest || feedback === undefined || trackedVersion === data.content.version) return;
		trackedVersion = data.content.version;
		const keys = keysToTrack(data.content, feedback);
		if (keys.length > 0 || feedback.firstRun === null) {
			void write('feedback.trackSeen', { keys }, { quiet: true });
		}
	});
</script>

<AppShell role={data.me.role} username={data.me.username} {badges}>
	{@render children()}
</AppShell>
