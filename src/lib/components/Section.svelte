<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';
	import type { IconName } from './icons';

	/*
	 * A card with one thing in it and one way to add to it (docs/05 §5.5).
	 *
	 * The form stays closed until asked for. The person page used to show six of them open at
	 * once, so reading about someone meant scrolling past a wall of empty inputs. A form that
	 * failed validation opens itself, otherwise the error would arrive on a form nobody can see.
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

	const expanded = $derived(open || error !== null);
</script>

<section class="rounded-app bg-card p-4 shadow-card">
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
				onclick={() => (open = !expanded)}
				aria-expanded={expanded}
			>
				{expanded ? 'Cancel' : addLabel}
			</Button>
		{/if}
	</header>

	{@render children()}

	{#if expanded && editor}
		<div class="mt-3 border-t border-border-subtle pt-3">
			{#if error}
				<p class="mb-3 rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
			{/if}
			{@render editor()}
		</div>
	{/if}
</section>
