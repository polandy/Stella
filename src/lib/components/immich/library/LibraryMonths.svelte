<!--
  @component
  A year's twelve months (docs/dev/02 §2.24.9), each with about how many photos it holds; a month
  without any is greyed and cannot be opened.
-->
<script lang="ts">
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { LibraryMonth } from '$lib/immich/library';
	import { monthName } from '$lib/immich/library-labels';

	interface Props {
		year: string;
		/** All twelve, in order, an empty one at a count of 0. */
		months: readonly LibraryMonth[];
		onpick: (month: string) => void;
	}

	let { year, months, onpick }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const about = (count: number) =>
		t('immich.library.aboutCount', { count: new Intl.NumberFormat(i18n.intlLocale).format(count) });
</script>

<ul
	class="grid grid-cols-3 gap-2 sm:grid-cols-4"
	aria-label={t('immich.library.months', { year })}
	data-testid="immich-library-months"
>
	{#each months as { month, count } (month)}
		<li>
			<button
				type="button"
				class="flex w-full flex-col gap-0.5 rounded-control bg-bg-sunken p-3 text-left enabled:hover:bg-card-hover disabled:opacity-40"
				disabled={count === 0}
				onclick={() => onpick(month)}
			>
				<span class="truncate text-sm font-semibold">{monthName(month, i18n.intlLocale)}</span>
				<span class="text-xs text-fg-muted tabular-nums">{count === 0 ? '–' : about(count)}</span>
			</button>
		</li>
	{/each}
</ul>
