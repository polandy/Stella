<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons';

	/*
	 * An empty screen is an invitation, not a dead end (docs/05 §5.10): one large icon in the
	 * subtle text colour, a line that says what belongs here, and the one action that starts
	 * it. Bands that are absent when empty (Coming up, Quiet lately) do not use this.
	 */
	interface Props {
		icon: IconName;
		title: string;
		hint?: string;
		/** The action, usually one `Button`. */
		children?: Snippet;
	}
	let { icon, title, hint, children }: Props = $props();
</script>

<div class="flex flex-col items-center gap-2 rounded-app border border-dashed border-border px-6 py-10 text-center">
	<span class="grid size-14 place-items-center rounded-full bg-bg-sunken text-fg-subtle" aria-hidden="true">
		<Icon name={icon} size={26} strokeWidth={1.5} />
	</span>
	<p class="mt-1 font-medium text-fg">{title}</p>
	{#if hint}<p class="max-w-xs text-sm text-fg-muted">{hint}</p>{/if}
	{#if children}<div class="mt-3">{@render children()}</div>{/if}
</div>
