<script lang="ts">
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { StripView } from '$lib/immich/together';

	/*
	 * Photos together (docs/02 §2.24.8): which of the person's Immich lists the Immich tab shows —
	 * their own, *You and Julia*, or the pair a relationship row's *Together* asked for. A second
	 * row under the tabs rather than more tabs: whose photos is a question about Immich alone, and
	 * five segments do not fit a phone's card.
	 */
	interface Props {
		views: readonly StripView[];
		shown: StripView;
		/** The page's person's first name, as the chips say it. */
		ownName: string;
		/** Whether the pair is the viewer and someone, said *you* rather than by name. */
		withViewer: (view: StripView & { contactId: string }) => boolean;
		/** The other one of a pair, by first name. */
		otherOf: (view: StripView & { contactId: string }) => string;
		onchoose: (view: StripView) => void;
	}
	let { views, shown, ownName, withViewer, otherOf, onchoose }: Props = $props();

	const t = useI18n().t;

	function label(view: StripView): string {
		if (view.kind === 'own') return t('immich.together.own', { name: ownName });
		if (withViewer(view)) return t('immich.together.withYou', { name: otherOf(view) });
		return t('immich.together.pair', { first: ownName, second: otherOf(view) });
	}
	const isShown = (view: StripView) =>
		view.kind === shown.kind &&
		(view.kind === 'own' || (shown.kind !== 'own' && view.contactId === shown.contactId));
</script>

<div
	class="mb-3 flex flex-wrap gap-1.5"
	role="group"
	aria-label={t('immich.together.label')}
	data-testid="immich-together"
>
	{#each views as view (view.kind === 'own' ? 'own' : view.contactId)}
		<button
			type="button"
			aria-pressed={isShown(view)}
			onclick={() => onchoose(view)}
			class="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-fg-muted transition-colors hover:border-primary hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-fg"
		>
			{label(view)}
		</button>
	{/each}
</div>
