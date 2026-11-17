<!--
  @component
  The years overview (docs/dev/02 §2.24.9): one tile per year that has photos, newest first, with
  about how many it holds and a meter against the busiest year.
-->
<script lang="ts">
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { LibraryYear } from '$lib/immich/library-nav';

	interface Props {
		years: readonly LibraryYear[];
		onpick: (year: string) => void;
	}

	let { years, onpick }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const about = (count: number) =>
		t('immich.library.aboutCount', { count: new Intl.NumberFormat(i18n.intlLocale).format(count) });
</script>

<ul
	class="grid grid-cols-2 gap-2 sm:grid-cols-3"
	aria-label={t('immich.library.years')}
	data-testid="immich-library-years"
>
	{#each years as { year, count, share } (year)}
		<li>
			<button
				type="button"
				class="flex w-full flex-col gap-1.5 rounded-control bg-bg-sunken p-3 text-left hover:bg-card-hover"
				onclick={() => onpick(year)}
			>
				<span class="text-base font-semibold tabular-nums">{year}</span>
				<span class="text-xs text-fg-muted tabular-nums">{about(count)}</span>
				<span class="h-1 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
					<span class="block h-full rounded-full bg-primary" style:width="{share * 100}%"></span>
				</span>
			</button>
		</li>
	{/each}
</ul>
