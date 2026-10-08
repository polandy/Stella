<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons';

	/*
	 * An empty screen is an invitation, not a dead end (docs/05 §5.10): one large icon in the
	 * subtle text colour, a line that says what belongs here, and the one action that starts
	 * it. A band that is absent when empty (Coming up) does not use this.
	 *
	 * `compact` is the same invitation inside a card that holds other things — a person's
	 * relationships, say — where a screen-sized block would push everything else away: a small
	 * icon beside the words, the action after them.
	 */
	interface Props {
		icon: IconName;
		title: string;
		hint?: string;
		compact?: boolean;
		/** The action, usually one `Button`. */
		children?: Snippet;
	}
	let { icon, title, hint, compact = false, children }: Props = $props();
</script>

{#if compact}
	<div
		class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-app border border-dashed border-border px-4 py-3"
	>
		<span
			class="grid size-9 shrink-0 place-items-center rounded-full bg-bg-sunken text-fg-subtle"
			aria-hidden="true"
		>
			<Icon name={icon} size={18} strokeWidth={1.5} />
		</span>
		<div class="min-w-0 flex-1 basis-48">
			<p class="text-sm font-medium text-fg">{title}</p>
			{#if hint}<p class="text-sm text-fg-muted">{hint}</p>{/if}
		</div>
		{#if children}<div class="shrink-0">{@render children()}</div>{/if}
	</div>
{:else}
	<div
		class="flex flex-col items-center gap-2 rounded-app border border-dashed border-border px-6 py-10 text-center"
	>
		<span
			class="grid size-14 place-items-center rounded-full bg-bg-sunken text-fg-subtle"
			aria-hidden="true"
		>
			<Icon name={icon} size={26} strokeWidth={1.5} />
		</span>
		<p class="mt-1 font-medium text-fg">{title}</p>
		{#if hint}<p class="max-w-xs text-sm text-fg-muted">{hint}</p>{/if}
		{#if children}<div class="mt-3">{@render children()}</div>{/if}
	</div>
{/if}
