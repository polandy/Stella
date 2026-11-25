<script lang="ts">
	import ArrangeBoard from '#lib/components/circle/ArrangeBoard.svelte';
	import ThenNowToggle from '#lib/components/circle/ThenNowToggle.svelte';
	import { useThenChoice } from '#lib/circles/then-choice.svelte.js';
	import { showsThen } from '#lib/circles/then-preference.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import type { PageData } from './$types';

	/*
	 * Arrange people (docs/dev/02 §2.4.2): its own view, reached from the circle's members section,
	 * so the circle's page stays about the circle. The board does the arranging.
	 */
	let { data }: { data: PageData } = $props();
	const { t } = useI18n();

	// *Then · Now*, as on the circle's page (docs/dev/02 §2.4.2), one choice for both.
	const thenChoice = useThenChoice();
	const then = $derived(data.then.shown && showsThen(thenChoice.choice, data.then.startsOnThen));

	const people = $derived(
		new Set(data.zones.flatMap((z) => z.members.map((m) => m.contactId))).size
	);
</script>

<svelte:head><title>{t('circles.arrange.title', { name: data.circle.name })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 md:px-6">
	<header class="flex flex-col gap-1">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h1 class="text-2xl font-semibold text-fg">{t('circles.arrange.heading')}</h1>
			{#if data.then.shown}
				<ThenNowToggle {then} onchoose={thenChoice.choose} />
			{/if}
		</div>
		<p class="text-sm text-fg-muted">
			{t('circles.arrange.summary', {
				name: data.circle.name,
				subCircles: data.zones.length - 1,
				people
			})}
		</p>
	</header>
	{#if then}
		<p class="text-xs text-fg-muted">{t('circles.then.hint')}</p>
	{/if}
	<ArrangeBoard pageId={data.circle.id} zones={data.zones} faces={then ? data.then.faces : null} />
</main>
