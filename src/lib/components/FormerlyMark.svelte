<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * *(formerly Widmer)* after a name, when a search found the person by their former name
	 * rather than by the name they are shown by (`foundByFormerName`, docs/02 §2.9). Nothing
	 * when there is nothing to explain.
	 */
	let { name }: { name: string | null | undefined } = $props();
	const t = useTranslate();
</script>

{#if name}<span class="ml-1 text-fg-subtle" data-testid="found-by-former-name">{t('components.foundByFormerName', { name })}</span>{/if}
