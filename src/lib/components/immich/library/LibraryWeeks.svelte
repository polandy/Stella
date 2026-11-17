<!--
  @component
  The chips under a month's trail (docs/dev/02 §2.24.9): one per ISO week the month touches, each
  jumping the grid to that week's first day. It is a jump within the month, not a level of its own.
-->
<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { LibraryWeek } from '$lib/immich/library-nav';

	interface Props {
		weeks: readonly LibraryWeek[];
		/** The week last jumped to, or null before any. */
		current: number | null;
		onpick: (week: LibraryWeek) => void;
	}

	let { weeks, current, onpick }: Props = $props();

	const t = useTranslate();
</script>

<ul
	class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 text-xs"
	aria-label={t('immich.library.weeks')}
	data-testid="immich-library-weeks"
>
	{#each weeks as week (week.week)}
		<li class="shrink-0">
			<button
				type="button"
				class="rounded-full border px-3 py-1.5 tabular-nums {current === week.week
					? 'border-primary bg-primary text-primary-fg'
					: 'border-border bg-card text-fg-muted hover:bg-card-hover'}"
				aria-current={current === week.week ? 'true' : undefined}
				aria-label={t('immich.library.jumpToWeek', { week: week.week })}
				onclick={() => onpick(week)}>{t('immich.library.week', { week: week.week })}</button
			>
		</li>
	{/each}
</ul>
