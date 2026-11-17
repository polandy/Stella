<!--
  @component
  The picker's foot (docs/dev/02 §2.24.9): how many photos are ticked, *Clear*, and *Add N photos* —
  or, while they are copied, how far that has come.
-->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { LibraryPhoto } from '$lib/immich/library';
	import { LIBRARY_PICK_LIMIT } from '$lib/immich/library-pick';

	interface Props {
		ticked: number;
		/** The ticked photos in order, each with its number, whichever view they were ticked in. */
		tray: readonly { number: number; photo: LibraryPhoto }[];
		full: boolean;
		copying: { done: number; count: number } | null;
		onclear: () => void;
		onuntick: (id: string) => void;
		onadd: () => void;
	}

	let { ticked, tray, full, copying, onclear, onuntick, onadd }: Props = $props();

	const t = useTranslate();
</script>

<div class="flex flex-col gap-2 border-t border-border pt-3 text-sm">
	{#if tray.length}
		<ul class="flex gap-1.5 overflow-x-auto py-1" data-testid="immich-library-tray">
			{#each tray as { number, photo } (photo.id)}
				<li class="shrink-0">
					<button
						type="button"
						class="relative block size-11 overflow-hidden rounded-control bg-bg-sunken"
						aria-label={t('immich.library.untick', { number })}
						disabled={copying !== null}
						onclick={() => onuntick(photo.id)}
					>
						<img src={photo.thumbnailUrl} alt="" class="size-full object-cover" />
						<span
							class="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full border border-scrim-fg bg-primary text-[11px] font-bold text-primary-fg tabular-nums"
							aria-hidden="true">{number}</span
						>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="flex items-center justify-between gap-3">
		{#if copying}
			<span class="text-fg-muted" aria-live="polite"
				>{t('immich.library.copying', { done: copying.done + 1, count: copying.count })}</span
			>
		{:else if ticked}
			<span class="flex items-center gap-1 text-fg-muted">
				<b class="text-fg">{t('immich.library.ticked', { count: ticked })}</b>
				{#if full}· {t('immich.library.atMost', { count: LIBRARY_PICK_LIMIT })}{/if}
				· <Button type="button" variant="ghost" size="sm" onclick={onclear}
					>{t('immich.library.clear')}</Button
				>
			</span>
		{:else}
			<span class="text-fg-subtle">{t('immich.library.tapToTick')}</span>
		{/if}
		<Button
			type="button"
			variant="primary"
			disabled={ticked === 0 || copying !== null}
			onclick={onadd}
			>{ticked ? t('immich.library.add', { count: ticked }) : t('immich.library.addPhotos')}</Button
		>
	</div>
</div>
