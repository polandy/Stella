<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/icons';
	import { FIELD_SELECTOR, firstField } from '$lib/components/ui/first-field';
	import { onMount, type Snippet } from 'svelte';
	import { EDIT_FRAME } from './inputs';

	/*
	 * A fact of the identity card being edited where it is read (docs/05 §5.5): its label over
	 * the editor, across the grid's whole width, as the job's form already stands. The cursor
	 * moves in when it opens, so a tap or Enter on the fact lands in what it opened; Escape
	 * closes it, and the card hands focus back to the fact (WCAG 2.4.3).
	 */
	interface Props {
		icon: IconName;
		label: string;
		/** Which fact this edits, for the card's reading and for tests. */
		name: string;
		onclose: () => void;
		/** Off where each item frames itself, as each address does, and the list's actions sit below. */
		framed?: boolean;
		children: Snippet;
	}
	let { icon, label, name, onclose, framed = true, children }: Props = $props();

	let frame = $state<HTMLDivElement>();
	onMount(() => {
		// An editor may name where it starts — past a list of Remove buttons, say.
		const start = frame?.querySelector<HTMLElement>('[data-autofocus]');
		if (start) return start.focus();
		firstField([
			...(frame?.querySelectorAll<HTMLElement & { type?: string; disabled?: boolean }>(
				FIELD_SELECTOR
			) ?? [])
		])?.focus();
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		onclose();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={frame}
	role="group"
	aria-label={label}
	onkeydown={onKeydown}
	class="col-span-full flex min-w-0 flex-col gap-1.5"
	data-fact-editor={name}
>
	<span class="flex items-center gap-1.5 text-xs text-fg-subtle">
		<Icon name={icon} size={12} />{label}
	</span>
	<div class={framed ? EDIT_FRAME : 'flex flex-col gap-3'}>
		{@render children()}
	</div>
</div>
