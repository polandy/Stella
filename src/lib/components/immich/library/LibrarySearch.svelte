<!--
  @component
  The picker's smart search (docs/dev/02 §2.24.9): Enter searches the whole library by description —
  not a form of its own, as the sheet may sit inside the upload's form.
-->
<script lang="ts">
	import { FIELD } from '$lib/components/ui/field';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';

	interface Props {
		/** Bindable: the words typed. */
		value?: string;
		onsearch: (words: string) => void;
	}

	let { value = $bindable(''), onsearch }: Props = $props();

	const t = useTranslate();

	function search(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		onsearch(value.trim());
	}
</script>

<div role="search" class="relative">
	<Icon
		name="search"
		size={16}
		class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
	/>
	<input
		type="search"
		bind:value
		placeholder={t('immich.library.search')}
		aria-label={t('immich.library.search')}
		autocomplete="off"
		enterkeyhint="search"
		onkeydown={search}
		class="{FIELD} w-full py-2 pr-3 pl-9"
	/>
</div>
