<script lang="ts">
	import ArrangeBoard from '$lib/components/circle/ArrangeBoard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { PageData } from './$types';

	/*
	 * Arrange people (docs/02 §2.4.2): its own view, reached from the circle's members section,
	 * so the circle's page stays about the circle. The board does the arranging.
	 */
	let { data }: { data: PageData } = $props();
	const { t } = useI18n();

	const people = $derived(
		new Set(data.zones.flatMap((z) => z.members.map((m) => m.contactId))).size
	);
</script>

<svelte:head><title>{t('circles.arrange.title', { name: data.circle.name })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 md:px-6">
	<div>
		<Button size="sm" variant="ghost" icon="back" href="/circles/{data.circle.id}">
			{t('circles.arrange.back', { name: data.circle.name })}
		</Button>
	</div>
	<header class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold text-fg">{t('circles.arrange.heading')}</h1>
		<p class="text-sm text-fg-muted">
			{t('circles.arrange.summary', {
				name: data.circle.name,
				subCircles: data.zones.length - 1,
				people
			})}
		</p>
	</header>
	<ArrangeBoard pageId={data.circle.id} zones={data.zones} />
</main>
