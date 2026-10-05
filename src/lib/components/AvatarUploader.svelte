<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
	import { invalidateAll } from '$app/navigation';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { CropRect } from '$lib/image/crop';
	import { processAvatar } from '$lib/image/process-avatar';
	import { loadFullPicture, sendCut } from '$lib/image/send-cut';
	import { mediaUrl, thumbnailUrl } from '$lib/media/urls';
	import { useRemovals } from '$lib/undo/context.svelte';
	import Avatar from './Avatar.svelte';
	import Button from './Button.svelte';
	import PhotoCropper from './PhotoCropper.svelte';

	/** A photo of one of the person's circles their picture can be cut from (circle-photos §5.1). */
	interface GroupPhotoChoice {
		id: string;
		circleName: string;
		/** The square they wear of it now, so choosing again starts there. */
		crop: CropRect | null;
	}

	interface Props {
		contactId: string;
		name: string;
		avatarPhotoId?: string | null;
		size?: number;
		/** Their circles' photos; with none, choosing a photo opens the file picker as it always did. */
		groupPhotos?: readonly GroupPhotoChoice[];
		/**
		 * The person page's portrait (docs/05 §5.5): a square with rounded corners whose size
		 * follows the screen — beside the name on a phone, a column of its own on a wide one —
		 * instead of a round avatar of `size`.
		 */
		portrait?: boolean;
	}
	let { contactId, name, avatarPhotoId = null, size = 64, groupPhotos = [], portrait = false }: Props = $props();

	const t = useTranslate();
	const removals = useRemovals();

	let input: HTMLInputElement;
	let busy = $state(false);
	let error = $state<string | null>(null);

	/** The picked picture while the person chooses its square; null when no cropper is open. */
	let picked = $state<File | null>(null);

	/*
	 * When one of their circles holds a photo the viewer can see, choosing a picture offers those
	 * group photos beside a file (docs/concepts/circle-photos.md §5.1); a pick opens the same
	 * cropper on the full group photo, and the square is cut from it rather than uploaded.
	 */
	let chooser: HTMLDialogElement | undefined = $state();
	let fromGroup = $state<{ photo: GroupPhotoChoice; picture: Blob } | null>(null);

	function choose() {
		if (groupPhotos.length > 0) chooser?.showModal();
		else input.click();
	}

	function chooseFile() {
		chooser?.close();
		input.click();
	}

	async function chooseGroupPhoto(photo: GroupPhotoChoice) {
		chooser?.close();
		error = null;
		busy = true;
		try {
			fromGroup = { photo, picture: await loadFullPicture(mediaUrl(photo.id)) };
		} catch {
			error = t('components.photo.failed');
		} finally {
			busy = false;
		}
	}

	async function cut(crop: CropRect) {
		const chosen = fromGroup;
		fromGroup = null;
		if (!chosen) return;
		const hadPreviousPhoto = avatarPhotoId !== null;
		busy = true;
		try {
			await sendCut(`/contacts/${contactId}?/cutFromGroupPhoto`, { photoId: chosen.photo.id }, chosen.picture, crop);
			await invalidateAll();
			if (hadPreviousPhoto) removals.notify(t('components.photo.previousKept'));
		} catch {
			error = t('components.photo.failed');
		} finally {
			busy = false;
		}
	}

	function onPick(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (input) input.value = '';
		if (!file) return;
		error = null;
		picked = file;
	}

	async function upload(crop: CropRect) {
		const file = picked;
		picked = null;
		if (!file) return;
		// Captured before the upload settles: replacing an existing photo keeps it in the
		// gallery (docs/02 §2.14), and only that case earns the reassurance toast.
		const hadPreviousPhoto = avatarPhotoId !== null;
		busy = true;
		try {
			const { image, thumb, width, height, takenAt } = await processAvatar(file, crop);
			const body = new FormData();
			body.append('image', image, 'avatar.jpg');
			body.append('thumb', thumb, 'thumb.jpg');
			body.append('width', String(width));
			body.append('height', String(height));
			if (takenAt) body.append('takenAt', takenAt);

			const res = await fetch(`/contacts/${contactId}?/setAvatar`, { method: 'POST', body });
			if (!res.ok) throw new Error();
			await invalidateAll();
			if (hadPreviousPhoto) removals.notify(t('components.photo.previousKept'));
		} catch {
			error = t('components.photo.failed');
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex flex-col items-center gap-2" data-testid="avatar-uploader">
	<button
		type="button"
		onclick={choose}
		disabled={busy}
		class="group relative outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
		class:rounded-full={!portrait}
		class:portrait
		aria-label={avatarPhotoId ? t('components.photo.change') : t('components.photo.add')}
		title={avatarPhotoId ? t('components.photo.change') : t('components.photo.add')}
	>
		<Avatar id={contactId} {name} {avatarPhotoId} {size} fill={portrait} />
		<span
			class="absolute inset-0 grid place-items-center bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 {portrait
				? 'rounded-[inherit]'
				: 'rounded-full'}"
			class:opacity-100={busy}
		>
			{busy ? '…' : avatarPhotoId ? t('components.photo.changeShort') : t('components.photo.addShort')}
		</span>
	</button>
	<input bind:this={input} onchange={onPick} type="file" accept="image/*" class="hidden" />
	<FormError message={error} variant="inline" size="xs" />
	<!-- One cropper for both: a picked file is uploaded, a group photo is cut from. -->
	<PhotoCropper
		file={picked ?? fromGroup?.picture ?? null}
		initial={picked ? null : (fromGroup?.photo.crop ?? null)}
		onconfirm={(crop) => (picked ? upload(crop) : cut(crop))}
		oncancel={() => {
			picked = null;
			fromGroup = null;
		}}
	/>
	{#if groupPhotos.length > 0}
		<dialog
			bind:this={chooser}
			aria-label={t('components.photo.choose')}
			onclick={(event) => event.target === event.currentTarget && chooser?.close()}
			class="m-auto w-full max-w-md rounded-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm"
			data-testid="avatar-chooser"
		>
			<div class="flex max-h-[85vh] flex-col gap-3 overflow-y-auto p-4">
				<div class="flex items-center justify-between gap-3">
					<h2 class="text-base font-semibold">{t('components.photo.choose')}</h2>
					<Button variant="ghost" size="sm" onclick={() => chooser?.close()}>{t('common.close')}</Button>
				</div>
				<Button variant="secondary" icon="photo" onclick={chooseFile} class="self-start">{t('components.photo.fromFile')}</Button>
				<h3 class="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t('components.photo.fromGroupPhoto')}</h3>
				<ul class="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{#each groupPhotos as photo (photo.id)}
						<li>
							<button
								type="button"
								onclick={() => chooseGroupPhoto(photo)}
								class="flex w-full flex-col gap-1 rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
								data-testid="avatar-group-photo"
							>
								<img src={thumbnailUrl(photo.id)} alt="" class="aspect-square w-full rounded-control bg-bg-sunken object-cover" loading="lazy" />
								<span class="truncate text-xs text-fg-muted">{photo.circleName}</span>
							</button>
						</li>
					{/each}
				</ul>
			</div>
		</dialog>
	{/if}
</div>

<style>
	/* 88px beside the name on a phone, 168px on its own column from `md` (docs/05 §5.5). */
	.portrait {
		display: block;
		width: 88px;
		height: 88px;
		border-radius: 22px;
		box-shadow: var(--shadow-card);
		container-type: size;
	}
	@media (width >= 48rem) {
		.portrait {
			width: 168px;
			height: 168px;
			border-radius: 28px;
		}
	}
</style>
