<script lang="ts">
	import GenderRow from '$lib/components/GenderRow.svelte';
	import Section from '$lib/components/Section.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import CirclesRow from './CirclesRow.svelte';
	import ContactFieldsRow from './ContactFieldsRow.svelte';
	import ImportantDatesRow from './ImportantDatesRow.svelte';
	import RecordActions from './RecordActions.svelte';
	import TagsRow from './TagsRow.svelte';
	import type { PersonForm, PersonPageData } from './types';

	// Who someone is, quietly: the person page's one profile card (docs/05 §5.5).
	let {
		data,
		form,
		otherContacts,
		metLine,
		isSelf,
		archived
	}: {
		data: PersonPageData;
		form: PersonForm;
		otherContacts: PersonPageData['people'];
		metLine: string | null;
		isSelf: boolean;
		archived: boolean;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
</script>

<section class="flex flex-col rounded-app bg-card p-4 shadow-card">
	<h2 class="mb-1 text-sm font-semibold text-fg">{t('contact.section.profile')}</h2>
	<GenderRow gender={c.gender} error={form?.genderError ?? null} />
	<ContactFieldsRow {data} {form} />

	<ImportantDatesRow {data} {form} />

	<CirclesRow {data} {form} />

	<TagsRow {data} {form} />

	<Section as="row" title={t('contact.section.howWeMet')} summary={metLine ?? undefined} startOpen={metLine !== null}>
		{#if metLine}
			<p class="font-serif text-[15px] leading-relaxed text-fg">{metLine}</p>
		{:else}
			<p class="text-sm text-fg-subtle">{t('contact.notRecorded')}</p>
		{/if}
	</Section>

	<!--
		The record-keeping actions live at the foot of the profile card, in one quiet
		stack: they are about the record rather than the person, and none of them is
		something anybody came here to do (docs/02 §2.2, §2.1.3).
	-->
	<div class="mt-3 flex flex-col gap-3 border-t border-border-subtle pt-3">
		<RecordActions {data} {form} {otherContacts} {isSelf} {archived} />
	</div>
</section>
