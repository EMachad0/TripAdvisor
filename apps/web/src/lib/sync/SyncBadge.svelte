<!--
	The sync badge (plan section 11), mounted once per tab by runtime.svelte.ts: a small pill just under the header on
	the right, so it never hides the page while the traveler is offline for hours. It says "Offline", "N unsynced" or
	"Paused · N"; a tap opens the details: "Offline · last synced 14:05 UTC+8", "N unsynced", or "Writes paused,
	N waiting" with "Copy pending changes" and "Retry". Hidden when everything is saved and the tab is online.
-->
<script lang="ts">
	import CirclePause from '@lucide/svelte/icons/circle-pause';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import TimeTz from '#lib/components/shell/TimeTz.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { SyncRuntime } from './runtime.svelte';
	import { badgeKind, dayLabel, localClock, pillText, unsyncedText, waitingText } from './status';

	interface Props {
		sync: SyncRuntime;
	}

	let { sync }: Props = $props();

	const kind = $derived(
		badgeKind({
			pending: sync.pending,
			paused: sync.paused,
			offline: sync.offline,
			slow: sync.slow,
		}),
	);
	const synced = $derived(sync.lastSynced === null ? null : localClock(sync.lastSynced));
	const day = $derived(sync.lastSynced === null ? '' : dayLabel(sync.lastSynced));
	const label = $derived(
		kind === 'paused'
			? waitingText(sync.pending)
			: kind === 'offline'
				? sync.pending > 0
					? `Offline, ${unsyncedText(sync.pending)}`
					: 'Offline'
				: unsyncedText(sync.pending),
	);

	let open = $state(false);
	let copied = $state('');
	let copyOpen = $state(false);

	$effect(() => {
		if (kind === 'hidden') open = false;
	});

	async function copy(): Promise<void> {
		copied = await sync.copyPending();
		open = false;
		copyOpen = true;
	}
</script>

{#if kind !== 'hidden'}
	<div class="fixed top-16 right-4 z-20 mt-2">
		<Popover.Root bind:open>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						size="sm"
						data-testid="sync-badge"
						data-kind={kind}
						aria-label={`${label}. Show sync details`}
					>
						{#if kind === 'paused'}
							<CirclePause data-icon="inline-start" class="text-warn" />
							<span class="text-warn">{pillText(kind, sync.pending)}</span>
						{:else if kind === 'offline'}
							<CloudOff data-icon="inline-start" class="text-muted-foreground" />
							{pillText(kind, sync.pending)}
						{:else}
							<RefreshCw data-icon="inline-start" class="text-warn" />
							{pillText(kind, sync.pending)}
						{/if}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" data-testid="sync-details">
				<Popover.Header>
					{#if kind === 'paused'}
						<Popover.Title><span class="text-warn">{waitingText(sync.pending)}</span></Popover.Title
						>
						<Popover.Description>
							The server is not taking changes right now. Your changes are kept on this device and
							sent once it does.
						</Popover.Description>
					{:else if kind === 'offline'}
						<Popover.Title>
							Offline ·
							{#if synced === null}
								not synced yet on this device
							{:else}
								last synced {day}
								<TimeTz time={synced.time} offset={synced.offset} />
							{/if}
						</Popover.Title>
						<Popover.Description>
							{#if sync.pending > 0}
								{unsyncedText(sync.pending)}: kept on this device and sent when the network is back.
							{:else}
								You are reading what this device saved. Changes you make are sent when the network
								is back.
							{/if}
						</Popover.Description>
					{:else}
						<Popover.Title>{unsyncedText(sync.pending)}</Popover.Title>
						<Popover.Description>Sending your changes…</Popover.Description>
					{/if}
				</Popover.Header>
				{#if kind === 'paused'}
					<div class="flex flex-wrap gap-2">
						<Button size="sm" variant="outline" onclick={() => void copy()}>
							Copy pending changes
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={sync.replaying}
							onclick={() => void sync.retry()}
						>
							<RefreshCw data-icon="inline-start" />
							Retry
						</Button>
					</div>
				{/if}
			</Popover.Content>
		</Popover.Root>
	</div>
{/if}

<Dialog.Root bind:open={copyOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Pending changes</Dialog.Title>
			<Dialog.Description>
				These writes are kept on this device and will be sent once writes resume. The JSON is on
				your clipboard; keep a copy somewhere safe if you need to.
			</Dialog.Description>
		</Dialog.Header>
		<Textarea
			readonly
			value={copied}
			rows={10}
			aria-label="Pending changes as JSON"
			data-testid="pending-json"
		/>
	</Dialog.Content>
</Dialog.Root>
