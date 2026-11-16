<!--
	The place / area sheet (FROZEN props; filled by slice E from old game.js openPlace / openArea / closeSheet): a
	bottom sheet with the platform's full page in an iframe (/place/<id>?embed=1 or /area/<id>?embed=1, slice H),
	and above it a bar with Close, the name and the Skip / Maybe / Must call, then the note editor.
	- Shallow routing: opening pushes a history entry, so the phone's Back button closes the sheet.
	- Until the page's text is there ({atr:'ready'} from the page, or the iframe's load event) a skeleton covers the
	  iframe, so a slow page never looks like an empty sheet. The bar and the note are usable meanwhile.
	- Closes on the Close button, Escape (not while typing a note), the backdrop, and the page's {atr:'close'}
	  postMessage; {atr:'open', id} opens that place in the same sheet. The theme toggle reaches the iframe
	  ({atr:'theme'}).
	- A place call is optimistic with rollback and toasts "<Verdict>: <name>"; an area call also closes the sheet
	  and can be undone in the Areas round, as before.
	- The guest sees the call and the note, read only.
	Background refreshes are held while it is open.
-->
<script lang="ts" module>
	import type { SheetTarget as Target } from './PlaceSheet.types.ts';

	/** What the sheet shows: a place or an area, and an optional fragment (#answer-<id>). */
	export type SheetTarget = Target;
</script>

<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { holdRefresh } from '#lib/components/shell/refresh.svelte.js';
	import TzText from '#lib/components/shell/TzText.svelte';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import { setCall, verdictsOf } from '#lib/features/cards/calls.svelte.js';
	import NoteEditor from '#lib/features/cards/NoteEditor.svelte';
	import VerdictSeg from '#lib/features/cards/VerdictSeg.svelte';
	import type { Verdict } from '#lib/features/cards/model.js';

	interface Props {
		/** null: closed. */
		target: SheetTarget | null;
		onclose: () => void;
	}

	let { target, onclose }: Props = $props();
	const app = getAppData();

	/** A place opened from inside the page ({atr:'open'}) replaces the parent's target until that changes. */
	let inner = $state<{ over: SheetTarget | null; target: SheetTarget } | null>(null);
	const shown = $derived(inner !== null && inner.over === target ? inner.target : target);
	/** What the sheet draws: the last card shown, kept while the sheet animates closed. */
	let lastShown = $state<SheetTarget | null>(null);
	$effect.pre(() => {
		if (shown !== null) lastShown = shown;
	});
	const view = $derived(shown ?? lastShown);

	const item = $derived.by(() => {
		if (view === null) return null;
		const { kind, id } = view;
		if (kind === 'area') {
			const a = app.content.areas.find((x) => x.id === id);
			return a === undefined ? null : { name: a.name, short: a.name, tz: a.tz, country: a.country };
		}
		const p = app.content.places.find((x) => x.id === id);
		return p === undefined
			? null
			: { name: p.name, short: p.short ?? p.name, tz: p.tz, country: p.country };
	});
	const title = $derived(item?.name ?? view?.id ?? '');
	const src = $derived(
		view === null ? '' : `/${view.kind}/${encodeURIComponent(view.id)}?embed=1${view.hash ?? ''}`,
	);
	const verdict = $derived(
		view === null ? undefined : verdictsOf(app.feedback)[view.kind][view.id],
	);
	const note = $derived(view === null ? '' : (app.feedback?.notes[view.kind][view.id] ?? ''));

	let frame: HTMLIFrameElement | undefined = $state();
	/** The src whose page has its text on screen; the skeleton covers the iframe until it matches. */
	let readySrc = $state('');
	const loading = $derived(src !== '' && readySrc !== src);

	// ---- shallow routing: opening adds a history entry, Back (popstate) closes the sheet
	/** The sheet's history entry is in place. */
	let pushed = false;
	let pushing = false;
	const isOpen = (): boolean => shown !== null;

	$effect(() => {
		if (shown === null) return;
		untrack(() => {
			if (pushed || pushing) return;
			pushing = true;
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- shallow entry on the current URL: only the history state changes
			void goto(page.url.href, { state: { atrSheet: true }, shallow: true }).then(() => {
				pushing = false;
				pushed = true;
				// Closed before the entry landed: take it back out.
				if (!isOpen()) history.back();
			});
		});
	});

	$effect(() => {
		const onPop = (): void => {
			if (!pushed) return;
			pushed = false;
			if (untrack(isOpen)) onclose();
		};
		window.addEventListener('popstate', onPop);
		return () => {
			window.removeEventListener('popstate', onPop);
		};
	});

	function close(): void {
		if (pushed) {
			history.back(); // popstate then calls onclose
			return;
		}
		onclose();
	}

	// ---- messages from the page, theme sync, refresh hold
	$effect(() => {
		if (shown === null) return;
		const release = holdRefresh();
		const onMessage = (e: MessageEvent<unknown>): void => {
			if (e.origin !== location.origin) return;
			const data = e.data;
			if (typeof data !== 'object' || data === null || !('atr' in data)) return;
			if (data.atr === 'close') close();
			if (
				data.atr === 'ready' &&
				e.source === frame?.contentWindow &&
				'path' in data &&
				data.path === src.split('#')[0]
			) {
				readySrc = src;
			}
			if (data.atr === 'open' && 'id' in data && typeof data.id === 'string') {
				const id = data.id;
				if (app.content.places.some((p) => p.id === id)) {
					inner = { over: target, target: { kind: 'place', id } };
				}
			}
		};
		const sendTheme = (): void => {
			const theme = document.documentElement.getAttribute('data-theme');
			frame?.contentWindow?.postMessage({ atr: 'theme', theme }, location.origin);
		};
		const observer = new MutationObserver(sendTheme);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme'],
		});
		window.addEventListener('message', onMessage);
		return () => {
			observer.disconnect();
			window.removeEventListener('message', onMessage);
			release();
		};
	});

	async function pick(next: Verdict): Promise<void> {
		if (shown === null || item === null) return;
		const { kind, id } = shown;
		const prev = verdict;
		if (kind === 'area') {
			const ok = await setCall('area', id, next, prev, { toastName: item.name, undo: true });
			if (ok) {
				await tick();
				close();
			}
			return;
		}
		await setCall('place', id, next, prev, { toastName: item.short });
	}
</script>

<Sheet.Root
	open={shown !== null}
	onOpenChange={(open) => {
		if (!open) close();
	}}
>
	<Sheet.Content
		side="bottom"
		showCloseButton={false}
		class="top-12 mx-auto max-w-6xl overflow-hidden"
		onEscapeKeydown={(e: KeyboardEvent) => {
			// Escape in the note finishes the note; it does not close the sheet.
			if (e.target instanceof HTMLTextAreaElement) e.preventDefault();
		}}
		data-cat={view?.kind === 'place'
			? app.content.places.find((p) => p.id === view.id)?.category
			: undefined}
		data-sheet={view === null ? undefined : `${view.kind}:${view.id}`}
	>
		<div class="flex min-h-0 flex-1 flex-col">
			<!-- On a phone the call gets its own full-width row under the name, so the name is not cut short. -->
			<div
				class="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-border/70 bg-card px-3 py-3 md:flex-nowrap md:px-4"
			>
				<Button variant="outline" size="icon" aria-label="Close (Esc)" onclick={close}>
					<XIcon />
				</Button>
				<Sheet.Title class="sr-only">{title}</Sheet.Title>
				<b
					aria-hidden="true"
					class="min-w-0 flex-1 truncate font-serif text-lg leading-tight font-semibold md:text-xl"
					>{title}</b
				>
				<div class="w-full md:w-auto">
					<VerdictSeg
						value={verdict}
						block
						disabled={app.isGuest}
						onpick={(v: Verdict) => void pick(v)}
					/>
				</div>
			</div>
			<Sheet.Description class="sr-only">
				{view?.kind === 'area' ? 'Area' : 'Place'} page, with your call and your note.
			</Sheet.Description>
			{#if view !== null && item !== null}
				{#if !app.isGuest}
					<div class="border-b border-border/70 bg-card px-3 py-3 md:px-4">
						{#key `${view.kind}:${view.id}`}
							<NoteEditor round={view.kind} id={view.id} name={item.name} variant="sheet" />
						{/key}
					</div>
				{:else if note !== ''}
					<p
						class="border-b border-border/70 bg-card px-4 py-2.5 text-sm text-note"
						data-note-readonly
					>
						<TzText text={note} offset={item.tz} />
					</p>
				{/if}
			{/if}
			{#if view !== null}
				<div class="relative flex min-h-0 flex-1 flex-col">
					<iframe
						bind:this={frame}
						{src}
						{title}
						class="w-full flex-1 border-0 bg-background"
						aria-busy={loading}
						onload={() => {
							// Not the empty document an iframe starts with: that one says nothing about the page.
							if (frame?.contentWindow?.location.href !== 'about:blank') readySrc = src;
						}}
					></iframe>
					{#if loading}
						<div
							class="absolute inset-0 overflow-hidden bg-background p-3 md:p-4"
							role="status"
							aria-label="Loading the page"
							data-sheet-loading
						>
							<Skeleton class="h-64 w-full md:h-96" />
							<div class="mx-auto flex max-w-3xl flex-col gap-4 py-6">
								<Skeleton class="h-8 w-2/3" />
								<Skeleton class="h-4 w-full" />
								<Skeleton class="h-4 w-11/12" />
								<Skeleton class="h-4 w-3/4" />
								<div class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
									<Skeleton class="h-20" />
									<Skeleton class="h-20" />
									<Skeleton class="h-20" />
									<Skeleton class="h-20" />
								</div>
								<Skeleton class="mt-4 h-40 w-full" />
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
