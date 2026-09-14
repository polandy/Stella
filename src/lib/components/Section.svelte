<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { tick, untrack, type Snippet } from 'svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import { FIELD_SELECTOR, firstField } from './first-field';
	import type { IconName } from './icons';

	/*
	 * A card with one thing in it and one way to add to it (docs/05 §5.5).
	 *
	 * The form stays closed until asked for. The person page used to show six of them open at
	 * once, so reading about someone meant scrolling past a wall of empty inputs. A form that
	 * failed validation opens itself, otherwise the error would arrive on a form nobody can see.
	 *
	 * It opens *directly under the header it was asked for from*, never at the foot of the card:
	 * a person with twelve relationships would otherwise press "Add" and watch nothing happen,
	 * because the form appeared a screen and a half below the button (docs/05 §5.7).
	 *
	 * `as="row"` is the same thing without the card around it: a disclosure line inside somebody
	 * else's card, closed until asked for, used for the person page's profile column (docs/05
	 * §5.5). One component rather than two, so the rules above cannot come to differ between a
	 * card and a row.
	 */
	interface Props {
		/** Omit where the surrounding card already names the section, so it is not said twice. */
		title?: string;
		/** `row` renders as a disclosure line inside another card instead of a card of its own. */
		as?: 'card' | 'row';
		/** The anchor a link may point at (docs/05 §5.5); cards only. */
		id?: string;
		/** What a closed row is worth reading for — a value or a short list. Rows only. */
		summary?: string;
		/**
		 * Whether a row starts unfolded. Rows only, and the caller answers it with "is there
		 * anything in me": an empty row folds away, a row holding a birthday does not hide it
		 * behind a click. What was too loud about the profile column was four cards with
		 * shadows, not the facts in them (docs/05 §5.5).
		 */
		startOpen?: boolean;
		/** Shown next to the title when the section holds something countable. */
		count?: number;
		/** Label for the disclosure button; omit for a section nothing can be added to. */
		addLabel?: string;
		addIcon?: IconName;
		/** An error from the last submit: keeps the form open so the message has a home. */
		error?: string | null;
		/** A second action for the header, e.g. a link elsewhere. */
		action?: Snippet;
		/** Bindable, so another control — a hero button, say — can open the form. */
		open?: boolean;
		children: Snippet;
		/** The form revealed by the disclosure button. */
		editor?: Snippet;
	}
	let {
		title,
		as = 'card',
		id,
		summary,
		startOpen = false,
		count,
		addLabel,
		addIcon = 'add',
		error = null,
		action,
		open = $bindable(false),
		children,
		editor
	}: Props = $props();

	const t = useTranslate();
	const expanded = $derived(open || error !== null);
	/*
	 * A row keeps its content folded away as well as its form; the card shows its content
	 * always. An open form pulls the row open with it, so a failed validation is never
	 * announced behind a fold.
	 */
	let unfolded = $state(untrack(() => startOpen));
	const shown = $derived(as === 'card' || unfolded || expanded);

	let card: HTMLElement | undefined = $state();
	let form: HTMLDivElement | undefined = $state();
	/*
	 * The form as it was a moment ago. What matters is the *opening*, not being open: a form
	 * that a failed validation rendered open has never been opened by anybody here, and moving
	 * the cursor into it would skip the error message the reader arrived for.
	 */
	let wasExpanded = false;

	function toggle() {
		open = !expanded;
	}

	// The form is useless where it cannot be seen, and empty where the cursor is not in it.
	// This catches a form opened from elsewhere too — the hero's "Log contact" opens the
	// story card's — since it watches the state rather than the button.
	$effect(() => {
		const justOpened = expanded && !wasExpanded && error === null;
		wasExpanded = expanded;
		if (!justOpened || !form) return;
		void tick().then(() => {
			card?.scrollIntoView({ block: 'nearest' });
			firstField([...(form?.querySelectorAll<HTMLElement>(FIELD_SELECTOR) ?? [])])?.focus();
		});
	});

	/*
	 * Escape closes the form and hands the cursor back to the button that opened it — unless a
	 * control inside already used it to close a suggestion list of its own, or the form is only
	 * open because a validation failed, in which case closing would take the error with it.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || event.defaultPrevented || error !== null) return;
		event.preventDefault();
		open = false;
		card?.querySelector<HTMLElement>('[data-section-toggle]')?.focus();
	}
</script>

{#snippet disclosure()}
	{#if editor && addLabel}
		<Button
			type="button"
			variant="ghost"
			size="sm"
			icon={expanded ? 'remove' : addIcon}
			onclick={toggle}
			aria-expanded={expanded}
			data-section-toggle
		>
			{expanded ? t('common.cancel') : addLabel}
		</Button>
	{/if}
{/snippet}

<!--
	The form sits above the content, so it is where the button that opened it is. `svelte-ignore`:
	the handler is on a plain box because Escape has to reach it from whichever field holds the
	cursor, and the form's own controls stay reachable by keyboard as they were.
-->
{#snippet body()}
	{#if expanded && editor}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={form}
			role="group"
			onkeydown={onKeydown}
			class="mb-3 border-b border-border-subtle pb-3"
		>
			{#if error}
				<p class="mb-3 rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
			{/if}
			{@render editor()}
		</div>
	{/if}

	{@render children()}
{/snippet}

{#if as === 'row'}
	<!-- Named in the DOM, so a row can be addressed without guessing at nesting. -->
	<section
		bind:this={card}
		data-row={title}
		class="scroll-mt-4 border-t border-border-subtle first:border-t-0"
	>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => (unfolded = !shown)}
				aria-expanded={shown}
				class="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm text-fg"
			>
				<span class="text-fg-subtle transition-transform" class:rotate-90={shown}>
					<Icon name="forward" size={13} />
				</span>
				<span class="font-medium">{title}</span>
				{#if count !== undefined}<span class="text-fg-subtle">{count}</span>{/if}
				{#if summary && !shown}
					<span class="ml-auto min-w-0 truncate pl-2 text-xs text-fg-subtle">{summary}</span>
				{/if}
			</button>
			<!-- The add button stays on a folded row: adding the first tag to a person who has
			     none was one click before this card existed, and it stays one. -->
			{#if shown}{@render action?.()}{/if}
			{@render disclosure()}
		</div>

		{#if shown}
			<div class="pb-3 pl-5">{@render body()}</div>
		{/if}
	</section>
{:else}
	<section {id} bind:this={card} class="scroll-mt-4 rounded-app bg-card p-4 shadow-card">
		<header class="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
			{#if title}
				<h2 class="text-sm font-semibold text-fg">{title}</h2>
				{#if count !== undefined}<span class="text-sm text-fg-subtle">{count}</span>{/if}
			{/if}
			<span class="flex-1"></span>
			<!-- The actions wrap among themselves and stay together on the right: a card may
			     offer more than one thing besides its own Add — the relationships card offers
			     two — and a row that cannot wrap pushes the last one off the card. -->
			<div class="flex flex-wrap items-center justify-end gap-2">
				{@render action?.()}
				{@render disclosure()}
			</div>
		</header>

		{@render body()}
	</section>
{/if}
