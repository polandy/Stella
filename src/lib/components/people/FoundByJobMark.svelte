<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * A small *Job* tag after a name, when a search found the person by their job title or
	 * company and by nothing else on the row (`foundByJob`, docs/02 §2.9). Nothing otherwise.
	 */
	let { found }: { found: boolean } = $props();
	const t = useTranslate();
</script>

{#if found}<span
		data-testid="found-by-job"
		title={t('components.foundByJobHint')}
		class="ml-1.5 rounded-full bg-primary-soft px-1.5 py-px align-[1px] text-[11px] font-semibold text-primary"
		>{t('components.foundByJob')}</span
	>{/if}
