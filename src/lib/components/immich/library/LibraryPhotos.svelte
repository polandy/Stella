<!--
  @component
  A grid of library photos to tick (docs/dev/02 §2.24.9): a tap ticks a photo, numbered in the order
  of the taps, and a second tap unticks it; once the limit is reached the unticked ones rest.
-->
<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { LibraryPhoto } from '$lib/immich/library';
	import { tickNumber } from '$lib/immich/library-pick';

	interface Props {
		photos: readonly LibraryPhoto[];
		ticked: readonly string[];
		/** Whether no more may be ticked. */
		full: boolean;
		/** While the ticked ones are copied, nothing can be tapped. */
		busy: boolean;
		/** What a tile says over its corner — a time, or a date — or null for nothing. */
		labelOf: (photo: LibraryPhoto) => string | null;
		ontoggle: (id: string) => void;
		testid?: string;
	}

	let { photos, ticked, full, busy, labelOf, ontoggle, testid }: Props = $props();

	const t = useTranslate();
</script>

<ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-4" data-testid={testid}>
	{#each photos as photo (photo.id)}
		{@const number = tickNumber(ticked, photo.id)}
		{@const label = labelOf(photo)}
		<li>
			<button
				type="button"
				class="group relative block aspect-square w-full overflow-hidden rounded-control bg-bg-sunken aria-pressed:ring-3 aria-pressed:ring-primary aria-pressed:ring-inset"
				aria-pressed={number !== null}
				aria-label={label
					? t('immich.library.photo', { when: label })
					: t('immich.library.photoUndated')}
				disabled={busy || (full && number === null)}
				onclick={() => ontoggle(photo.id)}
			>
				<img
					src={photo.thumbnailUrl}
					alt=""
					loading="lazy"
					class="size-full object-cover transition-opacity group-disabled:opacity-50"
				/>
				<span
					class="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full border-2 border-scrim-fg text-xs font-bold text-primary-fg tabular-nums shadow-card {number
						? 'bg-primary'
						: 'bg-scrim/20'}"
					aria-hidden="true">{number ?? ''}</span
				>
				{#if label}
					<span
						class="absolute bottom-1 left-1 rounded bg-scrim/55 px-1 text-[11px] text-scrim-fg tabular-nums"
						aria-hidden="true">{label}</span
					>
				{/if}
			</button>
		</li>
	{/each}
</ul>
