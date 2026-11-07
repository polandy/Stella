<script lang="ts">
	import KeptItem from '$lib/components/pwa/KeptItem.svelte';
	import { dayLabel as calendarDayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { MentionCandidate } from '$lib/mentions/mentions';
	import { asTyped, newPeopleAsCandidates } from '$lib/mentions/picks';
	import { contactSectionPath } from '$lib/people/sections';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { KIND_PRESENTATION } from '$lib/story/interaction-kinds';

	/*
	 * Everything this member kept on this device while Stella was out of reach (docs/02 §2.18.1),
	 * under Home's capture field, each looking like what it will become. A moment opens in Home's
	 * composer (`onedit`); the rest are edited on the page they belong to.
	 */
	let {
		people,
		onedit
	}: {
		/** Whom an @-mention in a kept text names. */
		people: readonly MentionCandidate[];
		onedit: (item: KeptOf<'moment.capture'>) => void;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;

	/** The day a kept moment is about, read the reader's way. */
	function keptDay(iso: string): string {
		return new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.intlLocale, {
			day: 'numeric',
			month: 'long'
		});
	}
</script>

{#if outbox.mine.length}
	<section
		class="mt-3 flex flex-col gap-1.5"
		aria-label={t('home.outbox.label')}
		data-testid="outbox"
	>
		{#each outbox.mine as item (item.command.id)}
			{#if isKept(item, 'moment.capture')}
				<KeptItem {item} onEdit={() => onedit(item)}>
					{#snippet meta()}
						<span
							class="ml-auto text-xs whitespace-nowrap text-fg-subtle"
							title={item.command.payload.entryDate}>{keptDay(item.command.payload.entryDate)}</span
						>
					{/snippet}
					<p class="mt-1 whitespace-pre-line text-fg">
						{asTyped(item.command.payload.body, [
							...people,
							...newPeopleAsCandidates(item.command.payload.newPeople)
						])}
					</p>
				</KeptItem>
			{:else if isKept(item, 'note.add')}
				<KeptItem {item} editHref={contactSectionPath(item.command.payload.contactId, 'notes')}>
					{#snippet meta()}<span>{t('home.outbox.noteOn', { name: item.about ?? '' })}</span
						>{/snippet}
					<p class="mt-1 whitespace-pre-line text-fg">
						{asTyped(item.command.payload.body, people)}
					</p>
				</KeptItem>
			{:else if isKept(item, 'interaction.log')}
				{@const kind = KIND_PRESENTATION[item.command.payload.kind]}
				<KeptItem {item} editHref={contactSectionPath(item.command.payload.contactId, 'story')}>
					{#snippet meta()}
						<span>· {t(kind.label)} · {item.about ?? ''}</span>
						<span
							class="ml-auto text-xs whitespace-nowrap text-fg-subtle"
							title={item.command.payload.happenedAt}
							>{keptDay(item.command.payload.happenedAt)}</span
						>
					{/snippet}
					{#if item.command.payload.title}<p class="mt-1 text-fg">
							{item.command.payload.title}
						</p>{/if}
				</KeptItem>
			{:else if isKept(item, 'tag.assign')}
				<KeptItem {item}>
					{#snippet meta()}<span>{t('home.outbox.tagOn', { name: item.about ?? '' })}</span
						>{/snippet}
					<p class="mt-1 text-fg">{item.command.payload.name}</p>
				</KeptItem>
			{:else if isKept(item, 'contact.add')}
				<KeptItem {item}>
					{#snippet meta()}<span>{t('home.outbox.newPerson')}</span>{/snippet}
					<p class="mt-1 text-fg">{item.about ?? ''}</p>
				</KeptItem>
			{:else if isKept(item, 'relationship.add')}
				<KeptItem {item}>
					{#snippet meta()}<span>{t('home.outbox.link')}</span>{/snippet}
					<p class="mt-1 text-fg">{item.about ?? ''}</p>
				</KeptItem>
			{:else if isKept(item, 'circle.join')}
				<KeptItem {item}>
					{#snippet meta()}<span>{t('home.outbox.circleFor', { name: item.about ?? '' })}</span
						>{/snippet}
					<p class="mt-1 text-fg">
						{item.command.payload.circleName}{item.command.payload.role
							? ` · ${item.command.payload.role}`
							: ''}
					</p>
				</KeptItem>
			{:else if isKept(item, 'journal.write')}
				<KeptItem {item}>
					{#snippet meta()}
						<span>{t('home.outbox.journalOf', { name: item.about ?? '' })}</span>
						<span
							class="ml-auto text-xs whitespace-nowrap text-fg-subtle"
							title={item.command.payload.entryDate}>{keptDay(item.command.payload.entryDate)}</span
						>
					{/snippet}
					<p class="mt-1 whitespace-pre-line text-fg">
						{asTyped(item.command.payload.body, people)}
					</p>
				</KeptItem>
			{:else if isKept(item, 'field.add')}
				<KeptItem {item}>
					{#snippet meta()}<span>{t('home.outbox.contactFor', { name: item.about ?? '' })}</span
						>{/snippet}
					<p class="mt-1 text-fg">{item.command.payload.value}</p>
				</KeptItem>
			{:else if isKept(item, 'date.add')}
				<KeptItem {item}>
					{#snippet meta()}<span>{t('home.outbox.dateFor', { name: item.about ?? '' })}</span
						>{/snippet}
					<p class="mt-1 text-fg">
						{[item.command.payload.label, calendarDayLabel(i18n, item.command.payload.date)]
							.filter(Boolean)
							.join(' · ')}
					</p>
				</KeptItem>
			{:else if isKept(item, 'gallery.add')}
				<KeptItem {item}>
					{#snippet meta()}<span>{t('home.outbox.photosOf', { name: item.about ?? '' })}</span
						>{/snippet}
				</KeptItem>
			{:else if isKept(item, 'circleGallery.add')}
				<KeptItem {item}>
					{#snippet meta()}<span>{t('home.outbox.photosFor', { name: item.about ?? '' })}</span
						>{/snippet}
				</KeptItem>
			{:else if isKept(item, 'gift.add')}
				<KeptItem {item} editHref={contactSectionPath(item.command.payload.contactId, 'gifts')}>
					{#snippet meta()}<span>{t('home.outbox.giftFor', { name: item.about ?? '' })}</span
						>{/snippet}
					<p class="mt-1 text-fg">{item.command.payload.title}</p>
				</KeptItem>
			{:else if isKept(item, 'todo.add')}
				<KeptItem {item} editHref={contactSectionPath(item.command.payload.contactId, 'todos')}>
					{#snippet meta()}<span>{t('home.outbox.todoFor', { name: item.about ?? '' })}</span
						>{/snippet}
					<p class="mt-1 text-fg">{item.command.payload.title}</p>
				</KeptItem>
			{:else if isKept(item, 'todo.tick')}
				<!-- A tick carries only ids; `about` holds the to-do's line, kept for this. -->
				<KeptItem {item}>
					{#snippet meta()}<span>{t('home.outbox.todoDone')}</span>{/snippet}
					<p class="mt-1 text-fg">{item.about}</p>
				</KeptItem>
			{/if}
		{/each}
	</section>
{/if}
