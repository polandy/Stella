<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { unveil } from '$lib/motion/motion.svelte';
	import { placeholderFor, revealPath } from '$lib/privacy/veil';
	import { useVeil } from '$lib/privacy/veil.svelte';

	/*
	 * A private entry's content, blurred on its author's screen until they ask for it
	 * (docs/02 §2.10.1, docs/05 §5.2.4). While veiled the real words are not on the page: a
	 * stand-in of the same shape is blurred instead, so find-in-page cannot land on them and a
	 * screen reader hears only the button. A photo is blurred itself — there are no words to find.
	 *
	 * Anything shared passes straight through, so a caller wraps every entry the same way.
	 */
	interface Props {
		/** Unique on the page across kinds, e.g. `note:<id>`. */
		id: string;
		isPrivate: boolean;
		/** The veil's accessible name — *Private note, hidden. Show*. */
		label: string;
		/** The entry's text or rendered Markdown, for the stand-in's shape. */
		text?: string | null;
		/** Blur the content itself: a photo. */
		photo?: boolean;
		/** Too small for words on the veil (a thumbnail): just the icon. */
		compact?: boolean;
		/**
		 * Inside a link (a mention, a search hit): no button of its own, which a link may not
		 * hold. The link opens the entry; the header lock shows it here.
		 */
		passive?: boolean;
		/** Classes for the box, in both states. */
		class?: string;
		/** Classes for the stand-in text, to match the real one. */
		textClass?: string;
		/** A stand-in of the caller's own, when the shape is more than one block of text. */
		standIn?: Snippet;
		children: Snippet;
	}
	let {
		id,
		isPrivate,
		label,
		text = null,
		photo = false,
		compact = false,
		passive = false,
		class: className = '',
		textClass = '',
		standIn,
		children
	}: Props = $props();

	const t = useTranslate();
	const veil = useVeil();
	const veiled = $derived(isPrivate && veil.isVeiled(id));
	const asks = $derived(revealPath(veil.device.status) === 'verify');

	// Counted for the header lock while it is on the page.
	$effect(() => {
		if (isPrivate && veil.enabled) return veil.register(id);
	});
</script>

{#if veiled}
	<div class="relative {photo ? 'overflow-hidden rounded-control' : ''} {className}">
		<div
			aria-hidden="true"
			inert
			class="pointer-events-none select-none {photo ? 'blur-xl' : 'blur-[7px]'}"
		>
			{#if photo}
				{@render children()}
			{:else if standIn}
				{@render standIn()}
			{:else}
				<p class="whitespace-pre-line {textClass}">{placeholderFor(text)}</p>
			{/if}
		</div>
		{#if passive}
			<span class="sr-only">{t('privacy.veil.hidden')}</span>
		{:else}
			<button
				type="button"
				class="absolute inset-0 flex items-center justify-center rounded-control bg-bg-sunken/30 text-xs font-semibold text-fg-muted"
				aria-label={label}
				title={compact ? label : undefined}
				onclick={() => veil.reveal(id)}
			>
				<span
					class="inline-flex items-center gap-1.5 rounded-full bg-card shadow-card {compact
						? 'p-1.5'
						: 'px-3 py-1'}"
				>
					<Icon name={asks ? 'deviceUnlock' : 'private'} size={13} />
					{#if !compact}{asks ? t('privacy.veil.unlockToShow') : t('privacy.veil.tapToShow')}{/if}
				</span>
			</button>
		{/if}
	</div>
{:else if isPrivate && veil.enabled}
	<div class={className} in:unveil>{@render children()}</div>
{:else}
	<div class={className}>{@render children()}</div>
{/if}
