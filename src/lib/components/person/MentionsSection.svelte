<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Section from '$lib/components/Section.svelte';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { PersonPageData } from './types';

	let { data }: { data: PersonPageData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
</script>

<!--
	Where somebody else names this person (docs/02 §2.20.1). Read-only: each item links
	to the person whose note or journal it is, because that is where it is written and
	edited. The list is already scoped to what this viewer may see.
-->
<Section
	id={sectionAnchor('mentions')}
	title={t('contact.section.mentions')}
	count={data.mentionedIn.length}
>
	{#if data.mentionedIn.length > 0}
		<ul class="flex flex-col gap-2" data-testid="mentioned-in">
			{#each data.mentionedIn as reference (reference.kind + reference.entryId)}
				<li>
					<a
						href={reference.href}
						data-kind={reference.kind}
						class="block rounded-control bg-bg-sunken p-3 transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
					>
						<div class="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
							<Icon name={reference.kind === 'note' ? 'write' : 'journal'} size={13} />
							<span class="text-fg-muted">
								{t('contact.mentions.in')}
								<span class="font-medium text-fg">{reference.sourceName}</span>’s
								{reference.kind === 'note'
									? t('contact.mentions.notes')
									: t('contact.mentions.journal')}
								{#if reference.author}· {t('contact.mentions.by', {
										author: reference.author
									})}{/if}
							</span>
							{#if reference.visibility === 'private'}
								<span class="ml-auto inline-flex items-center gap-1 text-xs text-fg-subtle">
									<Icon name="private" size={11} />{t('common.privateInline')}
								</span>
							{/if}
							<span
								class="text-xs text-fg-subtle"
								class:ml-auto={reference.visibility !== 'private'}
							>
								{dayLabel(i18n, reference.day)}
							</span>
						</div>
						{#if reference.title}
							<p class="text-sm font-medium text-fg">{reference.title}</p>
						{/if}
						{#if reference.snippet}
							<p class="text-sm text-fg-muted">{reference.snippet}</p>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-fg-subtle">
			{t('contact.mentions.none', { name: c.displayName })}
		</p>
	{/if}
</Section>
