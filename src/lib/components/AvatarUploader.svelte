<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { CropRect } from '$lib/image/crop';
	import { processAvatar } from '$lib/image/process-avatar';
	import { useRemovals } from '$lib/undo/context.svelte';
	import Avatar from './Avatar.svelte';
	import PhotoCropper from './PhotoCropper.svelte';

	interface Props {
		contactId: string;
		name: string;
		avatarPhotoId?: string | null;
		size?: number;
	}
	let { contactId, name, avatarPhotoId = null, size = 64 }: Props = $props();

	const t = useTranslate();
	const removals = useRemovals();

	let input: HTMLInputElement;
	let busy = $state(false);
	let error = $state<string | null>(null);

	/** The picked picture while the person chooses its square; null when no cropper is open. */
	let picked = $state<File | null>(null);

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
			const { image, thumb, width, height } = await processAvatar(file, crop);
			const body = new FormData();
			body.append('image', image, 'avatar.jpg');
			body.append('thumb', thumb, 'thumb.jpg');
			body.append('width', String(width));
			body.append('height', String(height));

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
		onclick={() => input.click()}
		disabled={busy}
		class="group relative rounded-full outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
		aria-label={avatarPhotoId ? t('components.photo.change') : t('components.photo.add')}
		title={avatarPhotoId ? t('components.photo.change') : t('components.photo.add')}
	>
		<Avatar id={contactId} {name} {avatarPhotoId} {size} />
		<span
			class="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100"
			class:opacity-100={busy}
		>
			{busy ? '…' : avatarPhotoId ? t('components.photo.changeShort') : t('components.photo.addShort')}
		</span>
	</button>
	<input bind:this={input} onchange={onPick} type="file" accept="image/*" class="hidden" />
	{#if error}<p class="text-xs text-danger">{error}</p>{/if}
	<PhotoCropper file={picked} onconfirm={upload} oncancel={() => (picked = null)} />
</div>
