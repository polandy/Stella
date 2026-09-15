<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * The page the service worker falls back to when a request can be answered neither by the
	 * network nor from the cache (docs/02 §2.18).
	 *
	 * It sits outside both route groups and loads nothing: it is fetched and cached while the
	 * connection still works, and shown much later, so anything it read then would be stale by
	 * the time anybody saw it.
	 */
	const t = useTranslate();

	function retry() {
		location.reload();
	}
</script>

<svelte:head><title>{t('pwa.offline.title')}</title></svelte:head>

<main class="mx-auto grid min-h-dvh max-w-md place-items-center px-6">
	<EmptyState icon="offline" title={t('pwa.offline.title')} hint={t('pwa.offline.body')}>
		<Button variant="secondary" onclick={retry}>{t('pwa.offline.retry')}</Button>
	</EmptyState>
</main>
