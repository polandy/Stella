<!--
  @component
  The picker's trail through the timeline (docs/dev/02 §2.24.9): *All years › 2026 › October › Wed 21*,
  or *All albums › Holidays*.
  Each crumb above the current one goes back up to it; the last one is where the picker is.
-->
<script lang="ts">
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { crumbLabel } from '#lib/immich/library-labels.js';
	import type { LibraryLevel } from '#lib/immich/library-nav.js';

	interface Props {
		crumbs: readonly LibraryLevel[];
		/** Whether the trail starts at all years; false when the key cannot read the timeline. */
		overview: boolean;
		onpick: (at: LibraryLevel) => void;
	}

	let { crumbs, overview, onpick }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const label = (at: LibraryLevel) =>
		crumbLabel(at, i18n.intlLocale, {
			overview,
			allYears: t('immich.library.allYears'),
			allAlbums: t('immich.library.allAlbums')
		});
</script>

<nav aria-label={t('immich.library.trail')} data-testid="immich-library-trail">
	<ol class="flex min-w-0 items-center gap-1 overflow-x-auto text-sm whitespace-nowrap">
		{#each crumbs as crumb, index (crumb.level)}
			{@const last = index === crumbs.length - 1}
			{#if index > 0}
				<li class="text-fg-subtle" aria-hidden="true">›</li>
			{/if}
			<li>
				{#if last}
					<span class="px-1.5 font-semibold text-fg" aria-current="page">{label(crumb)}</span>
				{:else}
					<button
						type="button"
						class="rounded-control px-1.5 py-1 text-primary hover:bg-card-hover"
						onclick={() => onpick(crumb)}>{label(crumb)}</button
					>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
