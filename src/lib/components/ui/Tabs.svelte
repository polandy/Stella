<script lang="ts" generics="T extends string">
	import type { Snippet } from 'svelte';
	import { tabAfterKey } from '$lib/ui/tabs';

	/*
	 * The pill-shaped tab list (docs/05 §5.7): the Gifts card, the Photos card, the Immich
	 * settings page. Tabs in the ARIA sense, so the arrow keys move between them and only the
	 * chosen one is a Tab stop. The panel stays with the caller, which names it in `panel` and
	 * labels it with the chosen tab's id, `${idPrefix}-${chosen}`.
	 */
	interface Props {
		tabs: readonly T[];
		chosen: T;
		onchoose: (tab: T) => void;
		/** What a screen reader hears for the whole list. */
		label: string;
		/** Each tab's id is `${idPrefix}-${tab}`, for the panel's `aria-labelledby`. */
		idPrefix: string;
		/** The id of the panel the tabs control. */
		panel: string;
		/** What a tab shows: its name, its count included. */
		content: Snippet<[T]>;
		/** `small` sits inside a card's header row. */
		size?: 'small' | 'normal';
		class?: string;
		testid?: string;
	}
	let {
		tabs,
		chosen,
		onchoose,
		label,
		idPrefix,
		panel,
		content,
		size = 'normal',
		class: extra = '',
		testid
	}: Props = $props();

	function step(event: KeyboardEvent) {
		const next = tabAfterKey(tabs, chosen, event.key);
		if (next === null) return;
		event.preventDefault();
		onchoose(next);
		document.getElementById(`${idPrefix}-${next}`)?.focus();
	}
</script>

<div
	role="tablist"
	aria-label={label}
	tabindex="-1"
	class={[
		'flex w-fit max-w-full rounded-full bg-bg-sunken',
		size === 'small' ? 'gap-0.5 p-0.5' : 'gap-1 p-1',
		extra
	]}
	onkeydown={step}
	data-testid={testid}
>
	{#each tabs as which (which)}
		<button
			type="button"
			role="tab"
			id="{idPrefix}-{which}"
			aria-selected={chosen === which}
			aria-controls={panel}
			tabindex={chosen === which ? 0 : -1}
			onclick={() => onchoose(which)}
			class={[
				'rounded-full whitespace-nowrap text-fg-muted transition-colors hover:text-fg aria-selected:bg-card aria-selected:font-medium aria-selected:text-fg aria-selected:shadow-card',
				size === 'small' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'
			]}
		>
			{@render content(which)}
		</button>
	{/each}
</div>
