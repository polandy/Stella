<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import MenuButton from '$lib/components/ui/MenuButton.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { RecordMenuEntry } from '$lib/people/identity-card';
	import { briefPath } from '$lib/people/sections';

	/*
	 * The identity card's ⋯ menu: everything that is not the one thing to do here (docs/05
	 * §5.5). Which entries it holds is `recordMenu`'s choice; the confirm steps it opens are
	 * the card's.
	 */
	let {
		entries,
		contactId,
		logContact,
		tracePath,
		openPanel
	}: {
		entries: RecordMenuEntry[];
		contactId: string;
		logContact: () => void;
		tracePath: () => void;
		openPanel: (panel: 'archive' | 'merge' | 'delete') => void;
	} = $props();

	const t = useTranslate();

	const ITEM_SHAPE =
		'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm hover:bg-primary-soft focus-visible:bg-primary-soft';
	const ITEM = `${ITEM_SHAPE} text-fg`;
	/** The one that cannot be undone, in the danger colour. */
	const DANGER_ITEM = `${ITEM_SHAPE} text-danger`;
</script>

<MenuButton label={t('contact.menu.label')} align="end" look="button">
	{#snippet trigger()}<Icon name="more" size={18} />{/snippet}
	{#snippet children({ close })}
		{#each entries as entry, index (index)}
			{#if entry === 'divider'}
				<hr class="my-1 border-border-subtle" />
			{:else if entry === 'logContact'}
				<button type="button" role="menuitem" class={ITEM} onclick={() => (close(), logContact())}>
					<Icon name="met" size={14} />{t('contact.logContact')}
				</button>
			{:else if entry === 'brief'}
				<!-- What to know before a visit, on a page of its own (docs/02 §2.2.5). -->
				<a
					href={briefPath(contactId)}
					role="menuitem"
					class={ITEM}
					onclick={close}
					data-testid="open-brief"
				>
					<Icon name="brief" size={14} />{t('brief.open')}
				</a>
			{:else if entry === 'thisIsMe' || entry === 'notMe'}
				<!-- Which of these people you are (docs/02 §2.1.3); the same item lets go again. -->
				<form method="POST" action="?/setSelf" class="contents">
					<button
						type="submit"
						role="menuitem"
						class={ITEM}
						title={entry === 'notMe' ? t('contact.self.isMeHint') : t('contact.self.hint')}
					>
						<Icon name="self" size={14} />{entry === 'notMe'
							? t('contact.self.notMe')
							: t('contact.self.thisIsMe')}
					</button>
				</form>
			{:else if entry === 'tracePath'}
				<button type="button" role="menuitem" class={ITEM} onclick={() => (close(), tracePath())}>
					<Icon name="connectionPath" size={14} />{t('contact.relationships.howConnected')}
				</button>
			{:else if entry === 'archive' || entry === 'restore'}
				<button
					type="button"
					role="menuitem"
					class={ITEM}
					onclick={() => (close(), openPanel('archive'))}
				>
					<Icon name="archive" size={14} />{entry === 'restore'
						? t('contact.archive.bringBack')
						: t('contact.menu.archive')}
				</button>
			{:else if entry === 'merge'}
				<button
					type="button"
					role="menuitem"
					class={ITEM}
					onclick={() => (close(), openPanel('merge'))}
				>
					<Icon name="people" size={14} />{t('contact.merge.open')}
				</button>
			{:else if entry === 'delete'}
				<button
					type="button"
					role="menuitem"
					class={DANGER_ITEM}
					onclick={() => (close(), openPanel('delete'))}
				>
					<Icon name="remove" size={14} />{t('contact.delete.open')}
				</button>
			{/if}
		{/each}
	{/snippet}
</MenuButton>
