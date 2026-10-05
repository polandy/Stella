<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import PhotoCropper from '$lib/components/PhotoCropper.svelte';
	import { invalidateAll } from '$app/navigation';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { immichMediaToken } from '$lib/immich/media-url';
	import type { CropRect } from '$lib/image/crop';
	import { processAvatar } from '$lib/image/process-avatar';
	import { loadFullPicture } from '$lib/image/send-cut';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { submitAction } from '$lib/undo/submit-action';

	/*
	 * *Use as photo* in the Immich viewer (docs/concepts/immich.md §4.3, docs/02 §2.24.6): the one
	 * way a photo from Immich becomes Stella's. The preview the viewer shows is fetched again
	 * through Stella's signed proxy, the cropper cuts a square of it, and the square is rendered
	 * and re-encoded here as any new picture is (docs/02 §2.14) — so nothing but the pixels leaves
	 * the browser. The server is told which preview it came from by its signed token, and dates the
	 * copy by what Immich said. A deliberate copy, never a sync: nothing follows the photo after.
	 */
	interface Props {
		contactId: string;
		/** The signed URL of the preview the viewer shows. */
		previewUrl: string;
		/** Whether the person wears a photo now; it then drops back into the gallery, and a toast says so. */
		hasPhoto: boolean;
		/** Called once the copy is the person's photo. */
		ondone: () => void;
	}
	let { contactId, previewUrl, hasPhoto, ondone }: Props = $props();

	const t = useTranslate();
	const removals = useRemovals();

	let picture = $state<Blob | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function open() {
		if (busy) return;
		busy = true;
		error = null;
		try {
			picture = await loadFullPicture(previewUrl);
		} catch {
			error = t('immich.viewer.useFailed');
		} finally {
			busy = false;
		}
	}

	async function keep(crop: CropRect) {
		const source = picture;
		picture = null;
		const token = immichMediaToken(previewUrl);
		if (!source || token === null) return;
		const hadPhoto = hasPhoto;
		busy = true;
		try {
			// The capture date the browser might read out of the preview is left behind: the
			// server dates the copy by what Immich said, signed into the token.
			const { image, thumb, width, height } = await processAvatar(source, crop);
			const body = new FormData();
			body.append('token', token);
			body.append('image', image, 'avatar.jpg');
			body.append('thumb', thumb, 'thumb.jpg');
			body.append('width', String(width));
			body.append('height', String(height));
			await submitAction(fetch, `/contacts/${encodeURIComponent(contactId)}?/useImmichPhoto`, body, {
				keepalive: false
			});
			await invalidateAll();
			if (hadPhoto) removals.notify(t('components.photo.previousKept'));
			ondone();
		} catch {
			error = t('immich.viewer.useFailed');
		} finally {
			busy = false;
		}
	}
</script>

<!-- Never disabled: a disabled button drops focus, and the cropper hands focus back to it on close. -->
<Button variant="secondary" size="sm" icon="photo" onclick={open} aria-busy={busy} data-testid="immich-use-as-photo">
	{t('immich.viewer.use')}
</Button>
<FormError message={error} variant="inline" size="xs" />
<PhotoCropper file={picture} initial={null} onconfirm={keep} oncancel={() => (picture = null)} />
