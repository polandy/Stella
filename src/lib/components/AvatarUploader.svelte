<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
	import { invalidateAll } from '$app/navigation';
	import { avatarChoices } from '$lib/contacts/avatar-chooser';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { GlimpsePhoto } from '$lib/immich/strip';
	import type { CropRect } from '$lib/image/crop';
	import { processAvatar } from '$lib/image/process-avatar';
	import { loadFullPicture, sendCut } from '$lib/image/send-cut';
	import { sendImmichPhoto } from '$lib/image/send-immich-photo';
	import { mediaUrl } from '$lib/media/urls';
	import { useRemovals } from '$lib/undo/context.svelte';
	import AvatarChooser, { type GroupPhotoChoice } from './AvatarChooser.svelte';
	import Avatar from './Avatar.svelte';
	import ImmichFacePicker from './person/ImmichFacePicker.svelte';
	import PhotoCropper from './PhotoCropper.svelte';

	interface Props {
		contactId: string;
		name: string;
		avatarPhotoId?: string | null;
		size?: number;
		/** Their circles' photos; with none and no Immich, choosing a photo opens the file picker as it always did. */
		groupPhotos?: readonly GroupPhotoChoice[];
		/**
		 * Immich as the page has it (docs/02 §2.24.6): whether the person is linked, or null without
		 * Immich or offline. With it, choosing a photo always offers Immich beside a file.
		 */
		immich?: { linked: boolean } | null;
		/** What *Find in Immich* searches for first: the person's first and last name. */
		immichSearchName?: string;
		/**
		 * The person page's portrait (docs/05 §5.5): a square with rounded corners whose size
		 * follows the screen — beside the name on a phone, a column of its own on a wide one —
		 * instead of a round avatar of `size`.
		 */
		portrait?: boolean;
	}
	let {
		contactId,
		name,
		avatarPhotoId = null,
		size = 64,
		groupPhotos = [],
		immich = null,
		immichSearchName = name,
		portrait = false
	}: Props = $props();

	const t = useTranslate();
	const removals = useRemovals();

	let input: HTMLInputElement;
	let busy = $state(false);
	let error = $state<string | null>(null);

	/*
	 * Where the picture comes from (`$lib/contacts/avatar-chooser`): a file at once when there is
	 * nothing else, else the chooser — a file, their group photos (docs/concepts/circle-photos.md
	 * §5.1), their latest Immich photos or *Find in Immich* (docs/02 §2.24.6). Every source opens
	 * the same cropper; only how the square is sent differs.
	 */
	const choices = $derived(avatarChoices({ groupPhotos: groupPhotos.length, immich }));
	let chooserOpen = $state(false);
	let pickerOpen = $state(false);

	/** The picture in the cropper, and where it came from; null when no cropper is open. */
	type Source =
		| { kind: 'file'; picture: File }
		| { kind: 'group'; picture: Blob; photo: GroupPhotoChoice }
		| { kind: 'immich'; picture: Blob; previewUrl: string };
	let source = $state<Source | null>(null);

	function choose() {
		if (choices.chooser) chooserOpen = true;
		else input.click();
	}

	/** Fetch the picture a pick names for the cropper; a failure is said under the picture. */
	async function load(fetchSource: () => Promise<Source>) {
		error = null;
		busy = true;
		try {
			source = await fetchSource();
		} catch {
			error = t('components.photo.failed');
		} finally {
			busy = false;
		}
	}

	const chooseGroupPhoto = (photo: GroupPhotoChoice) =>
		load(async () => ({
			kind: 'group',
			photo,
			picture: await loadFullPicture(mediaUrl(photo.id))
		}));

	const chooseImmichPhoto = (photo: GlimpsePhoto) =>
		load(async () => ({
			kind: 'immich',
			previewUrl: photo.previewUrl,
			picture: await loadFullPicture(photo.previewUrl)
		}));

	function onPick(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (input) input.value = '';
		if (!file) return;
		error = null;
		source = { kind: 'file', picture: file };
	}

	/** Post a picked file as the new avatar, with the capture date read out of it (docs/02 §2.14). */
	async function upload(file: File, crop: CropRect) {
		const { image, thumb, width, height, takenAt } = await processAvatar(file, crop);
		const body = new FormData();
		body.append('image', image, 'avatar.jpg');
		body.append('thumb', thumb, 'thumb.jpg');
		body.append('width', String(width));
		body.append('height', String(height));
		if (takenAt) body.append('takenAt', takenAt);
		const res = await fetch(`/contacts/${contactId}?/setAvatar`, { method: 'POST', body });
		if (!res.ok) throw new Error();
	}

	async function confirm(crop: CropRect) {
		const chosen = source;
		source = null;
		if (!chosen) return;
		// Captured before the upload settles: replacing an existing photo keeps it in the
		// gallery (docs/02 §2.14), and only that case earns the reassurance toast.
		const hadPreviousPhoto = avatarPhotoId !== null;
		busy = true;
		try {
			if (chosen.kind === 'file') await upload(chosen.picture, crop);
			else if (chosen.kind === 'group')
				await sendCut(
					`/contacts/${contactId}?/cutFromGroupPhoto`,
					{ photoId: chosen.photo.id },
					chosen.picture,
					crop
				);
			else await sendImmichPhoto(contactId, chosen.previewUrl, chosen.picture, crop);
			await invalidateAll();
			if (hadPreviousPhoto) removals.notify(t('components.photo.previousKept'));
		} catch {
			error =
				chosen.kind === 'immich' ? t('immich.viewer.useFailed') : t('components.photo.failed');
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
			{busy
				? '…'
				: avatarPhotoId
					? t('components.photo.changeShort')
					: t('components.photo.addShort')}
		</span>
	</button>
	<input bind:this={input} onchange={onPick} type="file" accept="image/*" class="hidden" />
	<FormError message={error} variant="inline" size="xs" />
	<!-- One cropper for every source; only how the square is sent differs. -->
	<PhotoCropper
		file={source?.picture ?? null}
		initial={source?.kind === 'group' ? source.photo.crop : null}
		onconfirm={confirm}
		oncancel={() => (source = null)}
	/>
	{#if choices.chooser}
		<AvatarChooser
			{contactId}
			{name}
			{groupPhotos}
			immich={choices.immich}
			bind:open={chooserOpen}
			onfile={() => input.click()}
			ongroup={chooseGroupPhoto}
			onimmich={chooseImmichPhoto}
			onfind={() => (pickerOpen = true)}
		/>
	{/if}
	{#if choices.immich === 'find'}
		<!-- Linked from here, the person's Immich photos are in the chooser when it opens again. -->
		<ImmichFacePicker
			{contactId}
			{name}
			searchName={immichSearchName}
			bind:open={pickerOpen}
			onlinked={() => (chooserOpen = true)}
		/>
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
