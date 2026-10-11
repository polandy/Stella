<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import { circleDeletionSentences, type CircleDeletionCounts } from '$lib/circles/deletion';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';

	/*
	 * Deleting a circle (docs/02 §2.4.2): the inline confirm step under the header, the person
	 * page's sunken box rather than a modal. It says what goes and what stays, from counts it asks
	 * for only now that it is open. The cursor starts on *Keep it*, so a second Enter never deletes
	 * anything. No Undo: the files go, and so does the page the reader is on — they land on the
	 * circles list, told *Class 1B deleted*.
	 */
	interface Props {
		circle: { id: string; name: string };
		/** Closes the step unchanged. */
		onclose: () => void;
	}

	let { circle, onclose }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	// `null` while counting; `'unknown'` when the counts could not be read — the step still says
	// what a deletion takes, only without the numbers, and the deletion itself still works.
	let counts = $state<CircleDeletionCounts | 'unknown' | null>(null);
	let box = $state<HTMLFormElement>();

	onMount(() => {
		box?.querySelector<HTMLElement>('[data-keep]')?.focus();
		const abort = new AbortController();
		fetch(`/circles/${circle.id}/deletion`, { signal: abort.signal })
			.then(async (response) => {
				counts = response.ok ? ((await response.json()) as CircleDeletionCounts) : 'unknown';
			})
			.catch(() => {
				if (!abort.signal.aborted) counts = 'unknown';
			});
		return () => abort.abort();
	});

	const sentences = $derived(
		counts === null
			? [t('circles.delete.counting')]
			: counts === 'unknown'
				? [t('circles.delete.unknown', { name: circle.name })]
				: circleDeletionSentences(i18n, counts)
	);

	// The toast is said before the page leaves, from the layout that outlives it.
	const announce: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type === 'redirect')
				removals.notify(t('circles.delete.done', { name: circle.name }));
			await update();
		};

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || event.defaultPrevented) return;
		event.preventDefault();
		onclose();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
	bind:this={box}
	transition:reveal
	method="POST"
	action="?/deleteCircle"
	use:enhance={announce}
	onkeydown={onKeydown}
	aria-label={t('circles.delete.label', { name: circle.name })}
	class="flex flex-col gap-2 rounded-app bg-bg-sunken p-3"
	data-testid="circle-delete"
>
	<div aria-live="polite" class="flex flex-col gap-1">
		{#each sentences as sentence (sentence)}
			<p class="text-sm text-fg">{sentence}</p>
		{/each}
	</div>
	<div class="flex flex-wrap gap-2">
		<Button variant="danger" size="sm">{t('circles.delete.submit', { name: circle.name })}</Button>
		<Button variant="ghost" size="sm" type="button" data-keep onclick={onclose}
			>{t('circles.delete.keep')}</Button
		>
	</div>
</form>
