<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import MenuButton from '$lib/components/ui/MenuButton.svelte';
	import { contactSectionPath } from '$lib/people/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { REVIEW_PARAM } from '$lib/relationships/review-url';

	/*
	 * The relationships card's ⋯ (docs/05 §5.5): what is asked less often — how two people are
	 * connected, the on-demand review, the whole graph.
	 */
	let {
		contactId,
		reviewOpen,
		canAskHowConnected,
		onAskHowConnected
	}: {
		contactId: string;
		/** A review is already under way, so the item offers to run it again. */
		reviewOpen: boolean;
		/** Somebody else is visible, so there is a second person to ask about. */
		canAskHowConnected: boolean;
		onAskHowConnected: () => void;
	} = $props();

	const t = useI18n().t;

	const MENU_ITEM =
		'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft';
</script>

<MenuButton label={t('contact.relationships.menu')} align="end" look="button">
	{#snippet trigger()}<Icon name="more" size={16} />{/snippet}
	{#snippet children({ close })}
		{#if canAskHowConnected}
			<button
				type="button"
				role="menuitem"
				class={MENU_ITEM}
				onclick={() => (close(), onAskHowConnected())}
			>
				<Icon name="connectionPath" size={14} />{t('contact.relationships.howConnected')}
			</button>
		{/if}
		<!--
			The on-demand review (docs/02 §2.4.1): nothing runs until it is chosen, and asking what
			else might be true is never what this card is for — so it waits in the menu.
		-->
		<a
			role="menuitem"
			class={MENU_ITEM}
			href={contactSectionPath(contactId, 'relationships', REVIEW_PARAM)}
		>
			<Icon name="search" size={14} />{reviewOpen
				? t('contact.relationships.reviewAgain')
				: t('contact.relationships.review')}
		</a>
		<!-- The way out of this person's two hops and into the household. -->
		<a role="menuitem" class={MENU_ITEM} href="/graph?center={contactId}">
			<Icon name="graph" size={14} />{t('graph.openInGraph')}
		</a>
	{/snippet}
</MenuButton>
