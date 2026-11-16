<!--
    The Trip pages' header (the old g-head / t-head), drawn like the shell's PageHeader: an eyebrow (kept as a test
    hook: it carries the trip span), the serif h1, a lede and actions on the right (Add stop). The Itinerary /
    Calendar / Map sub-tabs are in routes/(app)/trip/+layout.svelte.
-->
<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        eyebrow: string;
        title: string;
        lede?: string | undefined;
        action?: Snippet;
    }

    let { eyebrow, title, lede, action }: Props = $props();
</script>

<header
    class="mb-5 flex flex-col gap-3 md:mb-7 md:flex-row md:items-end md:justify-between md:gap-6"
>
    <div class="min-w-0">
        <p class="mb-1 eyebrow nums" data-testid="eyebrow">{eyebrow}</p>
        <h1
            class="font-serif text-3xl leading-none font-semibold tracking-tight md:text-4xl 3xl:text-5xl"
        >
            {title}
        </h1>
        {#if lede}
            <p class="mt-2 max-w-prose text-sm text-muted-foreground md:text-base">{lede}</p>
        {/if}
    </div>
    {#if action}<div class="flex shrink-0 flex-wrap items-center gap-2">{@render action()}</div>{/if}
</header>
