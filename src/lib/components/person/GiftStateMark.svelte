<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { GiftState } from '$lib/gifts/gifts';

	/*
	 * The square beside a gift: a yellow bulb while it is an idea, the gift colour once it was
	 * given or received — the same on the Gifts card and in a search hit (docs/02 §2.25).
	 */
	let { state }: { state: GiftState } = $props();
</script>

<span
	class="grid size-8 shrink-0 place-items-center rounded-control"
	style="color:{state === 'idea'
		? 'var(--accent-yellow)'
		: 'var(--kind-gift)'};background:color-mix(in srgb, currentColor 16%, transparent)"
>
	<Icon name={state === 'idea' ? 'idea' : 'gift'} size={15} />
</span>
