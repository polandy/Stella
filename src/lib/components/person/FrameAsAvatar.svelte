<script lang="ts">
	import FormError from '$lib/components/ui/FormError.svelte';
	import { invalidateAll } from '$app/navigation';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { CropRect } from '$lib/media/crop';
	import { processAvatar } from '$lib/media/process-avatar';
	import { mediaUrl } from '$lib/media/urls';
	import Button from '../ui/Button.svelte';
	import PhotoCropper from '../ui/PhotoCropper.svelte';

	/*
	 * Wearing a gallery photo as the person's avatar through a chosen square (docs/02 §2.14).
	 * The full picture is fetched back for the cropper, the square is rendered in the browser as
	 * any avatar is, and the server remembers it on a framing of this photo — so the gallery keeps
	 * one photo, and choosing again starts from the square chosen last time.
	 */

	interface Props {
		contactId: string;
		photoId: string;
		/** Whether the person wears this photo now. */
		isAvatar: boolean;
		/** The square chosen last time, if any. */
		framing: CropRect | null;
	}
	let { contactId, photoId, isAvatar, framing }: Props = $props();

	const t = useTranslate();

	let picture = $state<Blob | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function open() {
		if (busy) return;
		busy = true;
		error = null;
		try {
			const res = await fetch(mediaUrl(photoId));
			if (!res.ok) throw new Error(`The photo did not load (${res.status}).`);
			picture = await res.blob();
		} catch {
			error = t('components.photo.failed');
		} finally {
			busy = false;
		}
	}

	async function wear(crop: CropRect) {
		const source = picture;
		picture = null;
		if (!source) return;
		busy = true;
		try {
			const { image, thumb, width, height } = await processAvatar(source, crop);
			const body = new FormData();
			body.append('photoId', photoId);
			body.append('cropX', String(crop.x));
			body.append('cropY', String(crop.y));
			body.append('cropSize', String(crop.size));
			body.append('image', image, 'avatar.jpg');
			body.append('thumb', thumb, 'thumb.jpg');
			body.append('width', String(width));
			body.append('height', String(height));
			const res = await fetch(`/contacts/${contactId}?/framePhotoAsAvatar`, {
				method: 'POST',
				body
			});
			if (!res.ok) throw new Error(`The framing was not saved (${res.status}).`);
			await invalidateAll();
		} catch {
			error = t('components.photo.failed');
		} finally {
			busy = false;
		}
	}
</script>

<!-- Never disabled: a disabled button drops focus, and the dialog hands focus back to it on close. -->
<Button variant="primary" size="sm" onclick={open} aria-busy={busy}>
	{isAvatar ? t('components.frame.change') : t('components.frame.use')}
</Button>
<FormError message={error} variant="inline" size="xs" />
<PhotoCropper file={picture} initial={framing} onconfirm={wear} oncancel={() => (picture = null)} />
