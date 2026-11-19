<!--
  @component
  The album list (docs/dev/02 §2.24.9): own and shared albums, last photo first, two covers a row
  with the name, about how many photos and when they were taken. From twelve albums on, a filter
  by name. A cover that is no timeline photo shows a placeholder.
-->
<script lang="ts">
	import { FIELD } from '$lib/components/ui/field';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { LibraryAlbum } from '$lib/immich/library';
	import { albumsNamed, showsAlbumFilter } from '$lib/immich/library-albums';
	import { albumRange } from '$lib/immich/library-labels';
	import LibraryNotice from './LibraryNotice.svelte';

	interface Props {
		albums: readonly LibraryAlbum[];
		/** Bindable: the filter by name. */
		filter?: string;
		onpick: (album: LibraryAlbum) => void;
	}

	let { albums, filter = $bindable(''), onpick }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const shown = $derived(albumsNamed(albums, filter));
	const about = (count: number) =>
		t('immich.library.aboutCount', { count: new Intl.NumberFormat(i18n.intlLocale).format(count) });
</script>

{#if albums.length === 0}
	<LibraryNotice icon="photo" title={t('immich.library.noAlbums')} />
{:else}
	{#if showsAlbumFilter(albums.length)}
		<div class="relative mb-3">
			<Icon
				name="filter"
				size={16}
				class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
			/>
			<input
				type="search"
				bind:value={filter}
				placeholder={t('immich.library.albumFilter')}
				aria-label={t('immich.library.albumFilter')}
				autocomplete="off"
				enterkeyhint="done"
				onkeydown={(event) => event.key === 'Enter' && event.preventDefault()}
				class="{FIELD} w-full py-2 pr-3 pl-9"
				data-testid="immich-album-filter"
			/>
		</div>
	{/if}
	{#if shown.length === 0}
		<LibraryNotice icon="photo" title={t('immich.library.noAlbumNamed', { name: filter.trim() })} />
	{:else}
		<ul
			class="grid grid-cols-2 gap-2 sm:grid-cols-3"
			aria-label={t('immich.library.albums')}
			data-testid="immich-library-albums"
		>
			{#each shown as album (album.id)}
				<li>
					<button
						type="button"
						class="flex w-full flex-col gap-1.5 rounded-control bg-bg-sunken p-2 text-left hover:bg-card-hover"
						onclick={() => onpick(album)}
					>
						{#if album.coverUrl}
							<img
								src={album.coverUrl}
								alt=""
								loading="lazy"
								class="aspect-square w-full rounded-control object-cover"
							/>
						{:else}
							<span
								class="flex aspect-square w-full items-center justify-center rounded-control bg-card text-fg-subtle"
								data-testid="immich-album-no-cover"
							>
								<Icon name="photo" size={28} />
							</span>
						{/if}
						<span class="truncate px-1 text-sm font-semibold">{album.name}</span>
						<span class="truncate px-1 text-xs text-fg-muted tabular-nums"
							>{about(album.count)} · {albumRange(album.from, album.to, i18n.intlLocale)}</span
						>
					</button>
				</li>
			{/each}
		</ul>
		<p class="mt-3 text-xs text-fg-subtle">{t('immich.library.countsApproximate')}</p>
	{/if}
{/if}
