<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import PhotoCropper from '$lib/components/ui/PhotoCropper.svelte';
	import { invalidateAll } from '$app/navigation';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { CropRect } from '$lib/media/crop';
	import { loadFullPicture } from '$lib/media/send-cut';
	import { sendImmichPhoto } from '$lib/media/send-immich-photo';
	import { useRemovals } from '$lib/undo/context.svelte';

	/*
	 * *Use as photo* on an Immich photo in the lightbox (docs/02 §2.24.6): the one
	 * way a photo from Immich becomes Stella's. The preview the viewer shows is fetched again
	 * through Stella's signed proxy, the cropper cuts a square of it, and `sendImmichPhoto` keeps
	 * it — as the picture's chooser does too. A deliberate copy, never a sync.
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
		if (!source) return;
		const hadPhoto = hasPhoto;
		busy = true;
		try {
			await sendImmichPhoto(contactId, previewUrl, source, crop);
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
<Button
	variant="primary"
	size="sm"
	icon="photo"
	onclick={open}
	aria-busy={busy}
	data-testid="immich-use-as-photo"
>
	{t('immich.viewer.use')}
</Button>
<FormError message={error} variant="inline" size="xs" />
<PhotoCropper file={picture} initial={null} onconfirm={keep} oncancel={() => (picture = null)} />
