<script lang="ts">
	import { useI18n } from '$lib/i18n/context.svelte';
	import { copyAge } from '$lib/pwa/copy-age';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import Icon from '../ui/Icon.svelte';

	/*
	 * Says when the page being read came off this device rather than from Stella (docs/dev/02
	 * §2.18). Without it a cached person page is indistinguishable from a live one, and a note
	 * somebody added ten minutes ago looks like it was never written.
	 *
	 * The service worker is what knows, so the worker is what it listens to — see
	 * `$lib/pwa/reachability` for why `navigator.onLine` cannot answer this. Nothing is
	 * polled: the worker reports when the answer changes.
	 *
	 * When the worker knows when the page on screen was kept, the line says so: an old copy is
	 * normal offline, but it must never look current (docs/dev/02 §2.18, *Saying so*).
	 */
	const i18n = useI18n();
	const t = i18n.t;
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const line = $derived(
		reachability.keptAt === null
			? t('pwa.offline.banner')
			: t('pwa.offline.bannerAsOf', { when: copyAge(i18n, reachability.keptAt, Date.now(), zone) })
	);
</script>

<!-- The live region stays in the page so a screen reader announces the change (docs/dev/05 §5.9). -->
<div role="status" data-testid="offline-banner-region">
	{#if !reachability.reachable}
		<p
			data-testid="offline-banner"
			class="flex items-center justify-center gap-2 border-y border-warning/40 bg-warning-soft px-4 py-1.5 text-center text-sm font-medium text-fg"
		>
			<Icon name="offline" size={15} class="text-warning" />
			{line}
		</p>
	{/if}
</div>
