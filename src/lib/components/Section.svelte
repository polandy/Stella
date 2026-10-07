<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { tick, untrack, type Snippet } from 'svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import { FIELD_SELECTOR, firstField } from './first-field';
	import { focusLeftForm, owesFocusBack } from '$lib/ui/focus-return';
	import { focusDestination } from '$lib/ui/focus-destination';
	import { reveal, settleOpenedForm, showOpenedForm } from '$lib/motion/motion.svelte';
	import { openedFormGlide } from '$lib/motion/motion';
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
		/** After the add button, last in the header: a ⋯ menu of the card's rarer actions. */
		menu?: Snippet;
		/**
		 * The disclosure as an icon alone, its label its accessible name and tooltip — for a card
		 * whose header also holds a ⋯ menu and an *Edit*, where three worded buttons would wrap
		 * on a phone (docs/05 §5.5).
		 */
		iconAdd?: boolean;
		/** Bindable, so another control — a hero button, say — can open the form. */
		open?: boolean;
		children: Snippet;
		/** The form revealed by the disclosure button. */
		editor?: Snippet;
		/**
		 * What a card that holds nothing says, in one sentence. Given, the card stands as one
		 * line — its title, this sentence, its actions — and its body is not drawn, until its
		 * form is opened (docs/05 §5.5). Cards only.
		 */
		empty?: string;
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
		menu,
		iconAdd = false,
		open = $bindable(false),
		children,
		editor,
		empty
	}: Props = $props();

	const t = useTranslate();
	const expanded = $derived(open || error !== null);
	/*
	 * An empty card as one line. The header stays the same element when the form opens, so the
	 * add button the reader pressed is the Cancel that closes it again — focus never falls off
	 * a button that went away.
	 */
	const line = $derived(empty !== undefined && !expanded);
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
	/*
	 * Whether the cursor is in the form. A save or a cancel closes it and takes the focused
	 * field with it; the browser then drops focus on the page, and the next Tab would start at
	 * the top. Tracked from the form's own focus events, because by the time it has closed the
	 * field is gone and there is nothing left to ask (WCAG 2.4.3).
	 */
	let focusInForm = false;
	function onFocusOut(event: FocusEvent) {
		if (form && focusLeftForm(focusDestination(form, event.relatedTarget))) focusInForm = false;
	}

	function toggle() {
		open = !expanded;
	}

	// The form is useless where it cannot be seen, and empty where the cursor is not in it.
	// This catches a form opened from elsewhere too — the hero's "Log contact" opens the
	// story card's — since it watches the state rather than the button.
	$effect(() => {
		const justOpened = expanded && !wasExpanded && error === null;
		const justClosed = !expanded && wasExpanded;
		if (expanded && !wasExpanded) openGlide.opening();
		wasExpanded = expanded;
		if (justClosed) {
			const hadFocusInside = focusInForm;
			focusInForm = false;
			void tick().then(() => {
				const active = document.activeElement;
				const focusNow = active === null || active === document.body ? 'page' : 'elsewhere';
				if (owesFocusBack({ hadFocusInside, focusNow })) {
					card?.querySelector<HTMLElement>('[data-section-toggle]')?.focus();
				}
			});
			return;
		}
		if (!justOpened || !form) return;
		void tick().then(() => {
			if (!card) return;
			openGlide.opened(
				showOpenedForm(
					card,
					firstField([...(form?.querySelectorAll<HTMLElement>(FIELD_SELECTOR) ?? [])])
				)
			);
		});
	});

	/*
	 * Opening brings the card into view the one way every card form does (docs/05 §5.11), and
	 * settles it once the form has grown.
	 */
	const openGlide = openedFormGlide();
	function keepFormInView() {
		settleOpenedForm(card, form, openGlide.settle());
	}

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
	{#if editor && addLabel && iconAdd}
		<Button
			type="button"
			variant="ghost"
			size="sm"
			icon={expanded ? 'remove' : addIcon}
			label={expanded ? t('common.cancel') : addLabel}
			title={expanded ? t('common.cancel') : addLabel}
			onclick={toggle}
			aria-expanded={expanded}
			data-section-toggle
		/>
	{:else if editor && addLabel}
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
	The form sits above the content, so it is where the button that opened it is — and is set off
	from it only where there is content: an empty card's form is all the card holds. `svelte-ignore`:
	the handler is on a plain box because Escape has to reach it from whichever field holds the
	cursor, and the form's own controls stay reachable by keyboard as they were.
-->
{#snippet body()}
	{#if expanded && editor}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={form}
			transition:reveal
			onintroend={keepFormInView}
			role="group"
			onkeydown={onKeydown}
			onfocusin={() => (focusInForm = true)}
			onfocusout={onFocusOut}
			class={empty === undefined ? 'mb-3 border-b border-border-subtle pb-3' : undefined}
		>
			<FormError message={error} class="mb-3" />
			{@render editor()}
		</div>
	{/if}

	{@render children()}
{/snippet}

{#if as === 'row'}
	<!--
		Named in the DOM, so a row can be addressed without guessing at nesting. Two columns — the line, then its actions — rather than one flex line: a list of rows can
		make that a subgrid, so every row's actions start at one edge and their icons stand in a
		column instead of following each label's length (docs/05 §5.5).
	-->
	<section
		bind:this={card}
		data-row={title}
		class="grid scroll-mt-4 grid-cols-[minmax(0,1fr)_auto] content-start items-center gap-x-2 border-t border-border-subtle first:border-t-0"
	>
		<button
			type="button"
			onclick={() => (unfolded = !shown)}
			aria-expanded={shown}
			class="flex min-w-0 items-center gap-2 py-2 text-left text-sm text-fg"
		>
			<span
				class="text-fg-subtle transition-transform duration-(--motion-expand) ease-standard"
				class:rotate-90={shown}
			>
				<Icon name="forward" size={13} />
			</span>
			<span class="font-medium">{title}</span>
			{#if count !== undefined}<span class="text-fg-subtle">{count}</span>{/if}
			{#if summary && !shown}
				<span class="ml-auto min-w-0 truncate pl-2 text-xs text-fg-subtle">{summary}</span>
			{/if}
		</button>
		<!-- The add button stays on a folded row: adding the first tag to a person who has
		     none was one click before this card existed, and it stays one. Left-aligned in its
		     column, so the icon — not the end of the label — is what lines up. -->
		<div class="flex items-center gap-2" data-row-actions>
			{#if shown}{@render action?.()}{/if}
			{@render disclosure()}
		</div>

		{#if shown}
			<!-- Unfolds and folds in place (docs/05 §5.11); the line above it never moves. -->
			<div class="col-span-full pb-3 pl-5" transition:reveal>{@render body()}</div>
		{/if}
	</section>
{:else}
	<!-- `tabindex="-1"` on an anchored card: the jump bar hands it the cursor on arrival. The
	     check cannot read the value, which is never 0 or above. Named by its heading, so a
	     screen reader arriving there says which card it is rather than reading all of it. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<section
		{id}
		bind:this={card}
		tabindex={id ? -1 : undefined}
		aria-labelledby={id && title ? `${id}-title` : undefined}
		data-empty-line={line || undefined}
		class="scroll-mt-4 rounded-app bg-card shadow-card {line ? 'py-2 pr-2 pl-4' : 'p-4'}"
	>
		<!-- As one line it does not wrap: the sentence gives way, cut short, so the add button
		     stays beside the title on a phone. -->
		<header class="flex items-center gap-x-2 gap-y-1 {line ? 'flex-nowrap' : 'mb-3 flex-wrap'}">
			{#if title}
				<h2 id={id ? `${id}-title` : undefined} class="shrink-0 text-sm font-semibold text-fg">
					{title}
				</h2>
				{#if count !== undefined && !line}<span class="text-sm text-fg-subtle">{count}</span>{/if}
			{/if}
			{#if line}
				<p class="min-w-0 flex-1 truncate pl-1 text-sm text-fg-subtle">{empty}</p>
			{:else}
				<span class="flex-1"></span>
			{/if}
			<!-- The actions wrap among themselves and stay together on the right: a card may
			     offer more than one thing besides its own Add — the relationships card offers
			     two — and a row that cannot wrap pushes the last one off the card. On a phone
			     they only wrap below the title, where rows read from the left edge, not ragged
			     against the right one. -->
			<div
				class="flex flex-wrap items-center justify-end gap-2 max-sm:justify-start {line
					? 'shrink-0'
					: ''}"
			>
				{@render action?.()}
				{@render disclosure()}
				{@render menu?.()}
			</div>
		</header>

		{#if !line}{@render body()}{/if}
	</section>
{/if}
