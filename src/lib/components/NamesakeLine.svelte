<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { Distinction } from '$lib/people/namesakes';

	/*
	 * The second line under a person in a list where someone else shares their name (docs/02
	 * §2.2.3): the description, else where and when they were met, else a quiet admission that
	 * nothing tells them apart yet — which is itself the cue to add something.
	 */

	let { distinction }: { distinction: Distinction } = $props();

	const t = useTranslate();

	const text = $derived.by(() => {
		switch (distinction.kind) {
			case 'description':
				return distinction.text;
			case 'met':
				if (distinction.place && distinction.year)
					return t('components.namesake.metPlaceYear', { place: distinction.place, year: distinction.year });
				if (distinction.place) return t('components.namesake.metPlace', { place: distinction.place });
				return t('components.namesake.metYear', { year: distinction.year ?? '' });
			case 'nothing':
				return t('components.namesake.nothing');
		}
	});
</script>

<span class="block truncate text-xs text-fg-subtle" class:italic={distinction.kind === 'nothing'}>{text}</span>
