<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import MenuButton from '#lib/components/ui/MenuButton.svelte';
	import { giftGroupPath } from '#lib/gifts/group-form.js';
	import type { AddableGiftState } from '#lib/gifts/gifts.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';

	// The Gifts card's ⋯ menu: what the card's own buttons leave out.
	interface Props {
		/** The card is a line: *+ Given* has no button of its own then. */
		line: boolean;
		contactId: string;
		name: string;
		onAdd: (kind: AddableGiftState, close: () => void) => void;
		onRecord: (close: () => void) => void;
		onGives: (close: () => void) => void;
	}
	let { line, contactId, name, onAdd, onRecord, onGives }: Props = $props();

	const t = useI18n().t;

	const MENU_ITEM =
		'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft';
</script>

<MenuButton label={t('gifts.menu')} align="end" look="button">
	{#snippet trigger()}<Icon name="more" size={16} />{/snippet}
	{#snippet children({ close })}
		{#if line}
			<button type="button" role="menuitem" class={MENU_ITEM} onclick={() => onAdd('given', close)}>
				<Icon name="add" size={14} />{t('gifts.addGiven')}
			</button>
		{/if}
		<button
			type="button"
			role="menuitem"
			class={MENU_ITEM}
			onclick={() => onAdd('received', close)}
		>
			<Icon name="add" size={14} />{t('gifts.addReceived')}
		</button>
		<!-- What this person gives someone else, noted from their card (docs/dev/02 §2.25.15). -->
		<button type="button" role="menuitem" class={MENU_ITEM} onclick={() => onGives(close)}>
			<Icon name="add" size={14} />{t('gifts.gives.add', { name })}
		</button>
		<!-- What they got at a passed occasion, several at once (docs/dev/02 §2.25.14). -->
		<button
			type="button"
			role="menuitem"
			class={MENU_ITEM}
			title={t('gifts.record.menuHint', { name })}
			onclick={() => onRecord(close)}
		>
			<Icon name="gift" size={14} />{t('gifts.record.menu')}
		</button>
		<!-- One idea for them and others, each with what it comes to (docs/dev/02 §2.25.11). -->
		<a href={giftGroupPath(contactId)} role="menuitem" class={MENU_ITEM} onclick={close}>
			<Icon name="people" size={14} />{t('gifts.several.menu')}
		</a>
		<!-- Every idea of the household on one page (docs/dev/02 §2.25.6). -->
		<a href="/gifts" role="menuitem" class={MENU_ITEM} onclick={close}>
			<Icon name="idea" size={14} />{t('gifts.allIdeas')}
		</a>
	{/snippet}
</MenuButton>
