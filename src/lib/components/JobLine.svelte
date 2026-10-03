<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { jobShortForm } from '$lib/people/job';

	/*
	 * A person's job on its own line under their name in a list (docs/02 §2.2, §2.9): a
	 * briefcase and "Teacher at Primarschule Muri", cut short with … rather than wrapped, so a
	 * row keeps its height. Nothing when no job is on record.
	 */
	let {
		job,
		small = false
	}: {
		job: { jobTitle?: string | null; company?: string | null } | null;
		/** The size of a namesake line, for the compact rows of ⌘K and the pickers. */
		small?: boolean;
	} = $props();

	const t = useTranslate();
	const line = $derived(job ? jobShortForm(job, (parts) => t('contact.job.at', parts)) : null);
</script>

{#if line}
	<span data-testid="job-line" class="flex min-w-0 items-center gap-1 text-fg-muted" class:text-xs={small} class:text-sm={!small}>
		<Icon name="work" size={small ? 11 : 13} class="text-fg-subtle" />
		<span class="truncate">{line}</span>
	</span>
{/if}
