<!--
  @component
  The photos of an entry being edited (docs/02 §2.20): its stored ones and the Immich ones it
  refers to, each with a × that marks it for removal on save, and the ones picked since — from the
  device, or from Immich as references (docs/04 ADR-132). Taking an Immich photo off never
  deletes it in Immich.
-->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import ImmichLibraryPicker from '$lib/components/immich/ImmichLibraryPicker.svelte';
	import ImmichPhotoTile from '$lib/components/immich/ImmichPhotoTile.svelte';
	import PhotoSourceMenu from '$lib/components/immich/PhotoSourceMenu.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { EntryImmichPhoto, LibraryPhoto } from '$lib/immich/library';
	import { onDestroy } from 'svelte';

	interface Props {
		/** The entry's stored photos' ids, oldest first. */
		photos: string[];
		/** The Immich photos the entry refers to. */
		immichPhotos: EntryImmichPhoto[];
		/** The entry's day, where the Immich picker opens. */
		day: string;
		immichLibrary: boolean;
		/** Bindable: stored photos marked for removal. */
		removing: string[];
		/** Bindable: Immich references marked for removal, by asset id. */
		unlinking: string[];
		/** Bindable: pictures picked on the device, each with a preview until it is stored. */
		added: { file: File; url: string }[];
		/** Bindable: Immich photos picked, to be referred to on save. */
		linking: LibraryPhoto[];
	}

	let {
		photos,
		immichPhotos,
		day,
		immichLibrary,
		removing = $bindable(),
		unlinking = $bindable(),
		added = $bindable(),
		linking = $bindable()
	}: Props = $props();

	const t = useI18n().t;
	const kept = $derived(photos.filter((id) => !removing.includes(id)));
	const keptImmich = $derived(immichPhotos.filter((p) => !unlinking.includes(p.assetId)));
	const keptCount = $derived(kept.length + keptImmich.length);
	const newCount = $derived(added.length + linking.length);
	const marked = $derived(removing.length + unlinking.length);
	let libraryOpen = $state(false);

	const REMOVE =
		'tap-target absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-card text-fg-muted shadow hover:text-danger';

	function addFiles(files: File[]) {
		added = [...added, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))];
	}
	function onFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		addFiles(Array.from(input.files ?? []));
		input.value = '';
	}
	function dropAdded(url: string) {
		URL.revokeObjectURL(url);
		added = added.filter((a) => a.url !== url);
	}
	function link(picked: LibraryPhoto[]) {
		const known = new Set([...linking.map((p) => p.id), ...keptImmich.map((p) => p.assetId)]);
		linking = [...linking, ...picked.filter((p) => !known.has(p.id))];
	}
	onDestroy(() => added.forEach((a) => URL.revokeObjectURL(a.url)));
</script>

<div class="flex flex-col gap-2 text-sm" role="group" aria-label={t('journal.edit.photos')}>
	{#if keptCount || newCount}
		<ul class="flex flex-wrap gap-2">
			{#each kept as photoId, index (photoId)}
				{@const label = t('journal.edit.removePhoto', { n: index + 1, count: keptCount })}
				<li class="relative">
					<img
						src="/media/{photoId}?thumb"
						alt=""
						class="size-20 rounded-control border border-border object-cover"
					/>
					<button
						type="button"
						class={REMOVE}
						aria-label={label}
						title={label}
						onclick={() => (removing = [...removing, photoId])}
					>
						<Icon name="remove" size={14} />
					</button>
				</li>
			{/each}
			{#each keptImmich as photo, index (photo.assetId)}
				{@const label = t('journal.edit.removePhoto', {
					n: kept.length + index + 1,
					count: keptCount
				})}
				<li class="relative" data-testid="editor-immich-photo">
					<ImmichPhotoTile
						{photo}
						alt=""
						link={false}
						class="size-20 rounded-control border border-border"
					/>
					<button
						type="button"
						class={REMOVE}
						aria-label={label}
						title={label}
						onclick={() => (unlinking = [...unlinking, photo.assetId])}
					>
						<Icon name="remove" size={14} />
					</button>
				</li>
			{/each}
			{#each added as pick, index (pick.url)}
				{@const label = t('journal.edit.removeNewPhoto', { n: index + 1, count: newCount })}
				<li class="relative">
					<img
						src={pick.url}
						alt=""
						class="size-20 rounded-control border border-dashed border-primary object-cover"
					/>
					<button
						type="button"
						class={REMOVE}
						aria-label={label}
						title={label}
						onclick={() => dropAdded(pick.url)}
					>
						<Icon name="remove" size={14} />
					</button>
				</li>
			{/each}
			{#each linking as pick, index (pick.id)}
				{@const label = t('journal.edit.removeNewPhoto', {
					n: added.length + index + 1,
					count: newCount
				})}
				<li class="relative" data-testid="editor-immich-pick">
					<img
						src={pick.thumbnailUrl}
						alt=""
						class="size-20 rounded-control border border-dashed border-primary object-cover"
					/>
					<button
						type="button"
						class={REMOVE}
						aria-label={label}
						title={label}
						onclick={() => (linking = linking.filter((p) => p.id !== pick.id))}
					>
						<Icon name="remove" size={14} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#each removing as photoId (photoId)}
		<input type="hidden" name="removePhotoIds" value={photoId} />
	{/each}
	{#each unlinking as assetId (assetId)}
		<input type="hidden" name="unlinkImmichAssetIds" value={assetId} />
	{/each}
	<div class="flex flex-wrap items-center gap-3">
		{#if immichLibrary}
			<PhotoSourceMenu
				label={t('journal.addPhotos')}
				look="outline"
				onfiles={addFiles}
				onimmich={() => (libraryOpen = true)}
			>
				{#snippet trigger()}<Icon name="photo" size={15} />{t('journal.addPhotos')}{/snippet}
			</PhotoSourceMenu>
		{:else}
			<!-- `sr-only`, not `hidden`, so the picker stays in the tab order (WCAG 2.1.1). -->
			<label
				class="inline-flex cursor-pointer items-center gap-2 rounded-app border border-border px-3 py-2 text-fg-muted hover:text-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring"
			>
				<Icon name="photo" size={15} />
				{t('journal.addPhotos')}
				<input type="file" accept="image/*" multiple onchange={onFiles} class="sr-only" />
			</label>
		{/if}
		{#if marked}
			<span class="text-fg-subtle" role="status">
				{t('journal.edit.photosRemoved', { count: marked })}
			</span>
			<Button
				variant="ghost"
				type="button"
				onclick={() => {
					removing = [];
					unlinking = [];
				}}
			>
				{t('common.undo')}
			</Button>
		{/if}
	</div>
</div>

{#if immichLibrary}
	<ImmichLibraryPicker bind:open={libraryOpen} {day} onlink={link} />
{/if}
