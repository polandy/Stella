<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { tick, type Snippet } from 'svelte';
	import Button from './Button.svelte';
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
	 */
	interface Props {
		/** Omit where the surrounding tab already names the section, so it is not said twice. */
		title?: string;
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

	let card: HTMLElement;
	let form: HTMLDivElement | undefined = $state();
	/*
	 * Whether the form was opened during this visit, rather than server-rendered open by a
	 * failed validation. Only the first case moves the cursor: on the second the reader has
	 * just arrived on the page, and stealing focus would skip the error message they need.
	 */
	let openedHere = false;

	function toggle() {
		openedHere = !expanded;
		open = !expanded;
	}

	// The form is useless where it cannot be seen, and empty where the cursor is not in it.
	$effect(() => {
		if (!expanded || !form || !openedHere) return;
		openedHere = false;
		void tick().then(() => {
			card.scrollIntoView({ block: 'nearest' });
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
		card.querySelector<HTMLElement>('[data-section-toggle]')?.focus();
	}
</script>

<section bind:this={card} class="scroll-mt-4 rounded-app bg-card p-4 shadow-card">
	<header class="mb-3 flex items-center gap-2">
		{#if title}
			<h2 class="text-sm font-semibold text-fg">{title}</h2>
			{#if count !== undefined}<span class="text-sm text-fg-subtle">{count}</span>{/if}
		{/if}
		<span class="flex-1"></span>
		{@render action?.()}
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
	</header>

	<!--
		Above the content, so the form is where the button that opened it is. `svelte-ignore`:
		the handler is on a plain box because Escape has to reach it from whichever field holds
		the cursor, and the form's own controls stay reachable by keyboard as they were.
	-->
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
</section>
