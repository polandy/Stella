<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { jobShortForm } from '$lib/people/job';
	import JobEdit from './JobEdit.svelte';

	/*
	 * What a person does and where, on the profile card (docs/02 §2.2): one row reading the short
	 * form, or *Not on record* — the way in while nothing is, since the header then shows no line
	 * to tap. A tap opens the shared job editor in the row.
	 */
	interface Props {
		jobTitle: string | null;
		company: string | null;
		error?: string | null;
	}
	let { jobTitle, company, error = null }: Props = $props();

	const t = useTranslate();
	const line = $derived(jobShortForm({ jobTitle, company }, (parts) => t('contact.job.at', parts)));
</script>

<div class="border-t border-border-subtle first:border-t-0" data-row="job">
	<JobEdit
		{jobTitle}
		{company}
		{error}
		place="profile"
		formClass="py-2"
		triggerTitle={t('contact.job.edit')}
		triggerClass="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-control px-1 py-2 text-left text-sm transition-colors hover:bg-card-hover"
	>
		<span class="shrink-0 font-medium text-fg">{t('contact.job')}</span>
		{#if line}
			<span
				class="ml-auto min-w-0 text-right [overflow-wrap:anywhere] text-fg-muted"
				data-testid="job-value">{line}</span
			>
		{:else}
			<span class="ml-auto truncate text-fg-subtle">{t('contact.job.notRecorded')}</span>
		{/if}
	</JobEdit>
</div>
