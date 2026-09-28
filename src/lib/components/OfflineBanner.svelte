<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import Icon from './Icon.svelte';

	/*
	 * Says when the page being read came off this device rather than from Stella (docs/02
	 * §2.18). Without it a cached person page is indistinguishable from a live one, and a note
	 * somebody added ten minutes ago looks like it was never written.
	 *
	 * The service worker is what knows, so the worker is what it listens to — see
	 * `$lib/pwa/reachability` for why `navigator.onLine` cannot answer this. Nothing is
	 * polled: the worker reports when the answer changes.
	 */
	const t = useTranslate();
</script>

{#if !reachability.reachable}
	<p
		data-testid="offline-banner"
		role="status"
		class="flex items-center justify-center gap-2 bg-bg-sunken px-4 py-1.5 text-center text-sm text-fg-muted"
	>
		<Icon name="offline" size={15} />
		{t('pwa.offline.banner')}
	</p>
{/if}
