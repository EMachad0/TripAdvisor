<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import ContrastIcon from '@lucide/svelte/icons/contrast';

	// Same behaviour and storage key as the old site's themeToggle (platform/lib/render/util.js).
	function toggle(): void {
		const root = document.documentElement;
		const current =
			root.getAttribute('data-theme') ??
			(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
		const next = current === 'dark' ? 'light' : 'dark';
		root.setAttribute('data-theme', next);
		try {
			localStorage.setItem('atr-theme', next);
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}
</script>

<Button
	type="button"
	variant="ghost"
	size="icon"
	aria-label="Toggle light/dark theme"
	onclick={toggle}
>
	<ContrastIcon />
</Button>
