<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import InlineEdit from '$lib/components/InlineEdit.svelte';
	import LastNameHelp from './LastNameHelp.svelte';
	import NameEditor from './NameEditor.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { jobErrorFor, jobShortForm } from '$lib/people/job';
	import JobEdit from './JobEdit.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { PersonForm, PersonPageData } from './types';

	// The person page's hero (docs/05 §5.5): who this is, and the two things you came to do.
	let {
		data,
		form,
		metLine,
		isSelf,
		archived,
		logContact
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** How this person came into the household's life, as one line, or null. */
		metLine: string | null;
		isSelf: boolean;
		archived: boolean;
		/** Opens the story card's own form, wherever the reader is. */
		logContact: () => void;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	/** "Teacher at Primarschule Muri", edited on the profile card's job row (docs/02 §2.2). */
	const jobLine = $derived(jobShortForm(c, (parts) => t('contact.job.at', parts)));
	/** The day it happened, for the marker's tooltip. */
	const archivedOn = $derived(
		c.archivedAt === null ? null : dayLabel(i18n, new Date(c.archivedAt).toLocaleDateString('en-CA'))
	);
</script>

<!-- Hero: who this is, when you last spoke, and the two things you came to do -->
<header class="flex flex-wrap items-start gap-4">
	<AvatarUploader
		contactId={c.id}
		name={c.displayName}
		avatarPhotoId={c.avatarPhotoId}
		size={72}
		groupPhotos={data.groupPhotosToCut}
	/>
	<div class="min-w-0 flex-1">
		<!-- Name and description are edited where they are read (docs/02 §2.2). -->
		<NameEditor name={c} shownNameChosen={data.shownNameChosen} error={form?.namePartsError ?? null} />
		<!-- An earlier name, neutral on purpose: a maiden name and any other alike (docs/02 §2.2). -->
		{#if c.formerName}
			<p class="text-sm text-fg-muted" data-testid="former-name">{t('contact.formerly', { name: c.formerName })}</p>
		{/if}
		<!-- Stella's proposal for a missing last name, and passing a new one on. -->
		<LastNameHelp {data} />
		<p class="text-fg-muted">
			<InlineEdit
				action="?/editProfile"
				name="description"
				value={c.description ?? ''}
				label={t('contact.editDescription')}
				placeholder={t('contact.descriptionPlaceholder')}
				empty={t('contact.addDescription')}
			/>
		</p>
		<!--
			Edited where it is read, like the name and description (docs/02 §2.2): the line opens the
			same job editor as the profile card's row. With nothing on record there is no line — the
			profile card's *Job* row is the way in then. The profile wraps rather than cuts.
		-->
		{#if jobLine}
			<JobEdit
				jobTitle={c.jobTitle}
				company={c.company}
				place="header"
				error={jobErrorFor('header', form)}
				formClass="mt-1 rounded-control border border-primary bg-card p-3"
				triggerTitle={t('contact.job.edit')}
				triggerClass="-mx-1 mt-0.5 flex min-h-11 max-w-full items-center gap-1.5 rounded-control px-1 text-left text-sm text-fg transition-colors hover:bg-card-hover"
			>
				<Icon name="work" size={14} class="text-fg-subtle" />
				<span class="min-w-0 [overflow-wrap:anywhere]" data-testid="person-job">{jobLine}</span>
			</JobEdit>
		{/if}

		<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-subtle">
			{#if data.lastContactedAt}
				<span data-testid="last-contacted">
					{t('contact.lastContact')}
					<time datetime={data.lastContactedAt} class="font-medium text-fg-muted">
						{dayLabel(i18n, data.lastContactedAt)}
					</time>
				</span>
			{:else}
				<span data-testid="last-contacted">{t('contact.noContactYet')}</span>
			{/if}
			{#if metLine}<span>{t('contact.met')} <span class="font-medium text-fg-muted">{metLine}</span></span>{/if}
			{#if isSelf}
				<span
					data-testid="self-marker"
					class="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-primary"
					title={t('contact.self.badgeHint')}
				>
					<Icon name="self" size={11} />{t('common.you')}
				</span>
			{/if}
			{#if c.visibility === 'private'}
				<span class="inline-flex items-center gap-1" title={t('contact.privateContact')}>
					<Icon name="private" size={11} />{t('contact.private')}
				</span>
			{/if}
			{#if archived}
				<span
					data-testid="archived-marker"
					class="inline-flex items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 text-fg-muted"
					title={t('contact.archivedOn', { day: archivedOn ?? '' })}
				>
					<Icon name="archive" size={11} />{t('contact.archived')}
				</span>
			{/if}
		</div>
		<FormError message={form?.avatarError} variant="inline" size="xs" class="mt-1" />
	</div>

	<div class="flex w-full gap-2 sm:w-auto">
		<Button variant="primary" icon="write" href="/contacts/{c.id}/journal" class="flex-1 sm:flex-none">
			{t('contact.write')}
		</Button>
		<Button icon="met" type="button" onclick={logContact} class="flex-1 sm:flex-none">
			{t('contact.logContact')}
		</Button>
	</div>
</header>
