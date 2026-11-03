<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { PENCIL_AT_VALUE_END, VALUE_WITH_PENCIL } from '$lib/components/ui/edit-pencil';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { jobErrorFor } from '$lib/people/job';
	import JobEdit from './JobEdit.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * The job on the identity card, edited where it is read like the name (docs/02 §2.2); empty,
	 * a slot opens it.
	 */
	let {
		contact,
		form,
		jobLine,
		slot
	}: {
		contact: PersonPageData['contact'];
		form: PersonForm;
		/** "Teacher at Primarschule Muri", or null while there is none. */
		jobLine: string | null;
		slot: boolean;
	} = $props();

	const t = useTranslate();
</script>

<div
	class="relative flex min-w-0 flex-col gap-0.5 rounded-control has-[[data-pane=on]:not([inert])_form]:col-span-full {slot
		? 'border border-dashed border-border px-2 py-1.5'
		: '-mx-1.5 px-1.5 py-0.5'} has-[button:hover]:bg-card-hover"
	data-fact="job"
	data-slot={slot ? '' : undefined}
>
	<dt class="flex items-center gap-1.5 text-xs text-fg-subtle">
		<Icon name="work" size={12} />{t('contact.job')}
	</dt>
	<dd class="min-w-0 text-sm [overflow-wrap:anywhere] text-fg">
		<JobEdit
			jobTitle={contact.jobTitle}
			company={contact.company}
			place={slot ? 'profile' : 'header'}
			error={jobErrorFor(slot ? 'profile' : 'header', form)}
			formClass="mt-1 rounded-control border border-primary bg-card p-3"
			triggerTitle={t('contact.job.edit')}
			triggerClass="block max-w-full text-left after:absolute after:inset-0 after:rounded-control"
		>
			{#if slot}
				<span class="sr-only"
					>{t('contact.identity.addThings', {
						things: t('contact.identity.missing.job')
					})}</span
				><span class="inline-flex items-center gap-1 text-fg-subtle" aria-hidden="true"
					><Icon name="add" size={14} />{t('common.add')}</span
				>
			{:else}
				<span class="sr-only">{t('contact.job.edit')}: </span><span class={VALUE_WITH_PENCIL}
					><Icon name="rename" size={12} class={PENCIL_AT_VALUE_END} /><span
						class="[overflow-wrap:anywhere]"
						data-testid="person-job">{jobLine}</span
					></span
				>
			{/if}
		</JobEdit>
	</dd>
</div>
