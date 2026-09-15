<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { ASK_REACHABILITY, isReachabilityReport } from '$lib/pwa/reachability';
	import Icon from './Icon.svelte';

	/*
	 * Says when the page being read came off this device rather than from Stella (docs/02
	 * §2.18). Without it a cached person page is indistinguishable from a live one, and a note
	 * somebody added ten minutes ago looks like it was never written.
	 *
	 * The service worker is what knows, so the worker is what it listens to — see
	 * `$lib/pwa/reachability` for why `navigator.onLine` cannot answer this. Nothing is
	 * polled: the worker reports when the answer changes, and a page that has just opened asks
	 * once for the answer it was not around to hear.
	 */
	const t = useTranslate();

	// Starts reachable so the server render carries no banner; the worker settles it on mount.
	let reachable = $state(true);

	$effect(() => {
		const worker = navigator.serviceWorker;
		if (!worker) return;

		const onMessage = (event: MessageEvent) => {
			if (isReachabilityReport(event.data)) reachable = event.data.reachable;
		};
		worker.addEventListener('message', onMessage);
		worker.ready.then(() => worker.controller?.postMessage(ASK_REACHABILITY));

		return () => worker.removeEventListener('message', onMessage);
	});
</script>

{#if !reachable}
	<p
		data-testid="offline-banner"
		role="status"
		class="flex items-center justify-center gap-2 bg-bg-sunken px-4 py-1.5 text-center text-sm text-fg-muted"
	>
		<Icon name="offline" size={15} />
		{t('pwa.offline.banner')}
	</p>
{/if}
