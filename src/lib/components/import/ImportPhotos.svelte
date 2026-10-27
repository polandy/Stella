<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import type { Snippet } from 'svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { processImage } from '$lib/media/process-image';

	/*
	 * The wizard's last step (docs/02 §2.16), in the browser: the pictures come either from the
	 * file itself or from Monica's `photos` folder, and each is downscaled here (no native image
	 * library on the server) and sent one at a time. The server decides whose photo each is.
	 */
	interface Props {
		token: string;
		photos: { id: string; file: string }[];
		/** A JSON export and a vCard carry their pictures; a dump only names them. */
		embedded: boolean;
		/** What was imported, above the photos. */
		children: Snippet;
	}
	let { token, photos, embedded, children }: Props = $props();

	const t = useTranslate();

	interface PhotoProgress {
		total: number;
		done: number;
		stored: number;
		already: number;
		missing: number;
		failed: number;
	}
	let progress = $state<PhotoProgress | null>(null);
	let uploading = $state(false);

	/** Store one picture: downscale it here and post both renditions with the staging token. */
	async function storePhoto(id: string, file: Blob): Promise<'stored' | 'already'> {
		const { image, thumb, width, height, takenAt } = await processImage(file);
		const body = new FormData();
		body.append('token', token);
		body.append('photoId', id);
		body.append('image', image, 'image.jpg');
		body.append('thumb', thumb, 'thumb.jpg');
		body.append('width', String(width));
		body.append('height', String(height));
		// Monica kept the files as they were uploaded, so their EXIF still says when they were taken.
		if (takenAt) body.append('takenAt', takenAt);
		const res = await fetch('/settings/import/photos', { method: 'POST', body });
		if (!res.ok) throw new Error(`The server refused this photo (${res.status}).`);
		return ((await res.json()) as { status: 'stored' | 'already' }).status;
	}

	/**
	 * Walk the planned photos, asking `pictureFor` where each one's bytes come from — a file
	 * the admin picked out of Monica's folder, or the export itself. Returning null means the
	 * picture is not there, which is counted rather than failed.
	 */
	async function storeAll(
		pictureFor: (photo: { id: string; file: string }) => Promise<Blob | null>
	) {
		uploading = true;
		const p: PhotoProgress = {
			total: photos.length,
			done: 0,
			stored: 0,
			already: 0,
			missing: 0,
			failed: 0
		};
		progress = p;
		for (const expected of photos) {
			try {
				const picture = await pictureFor(expected);
				if (picture === null) p.missing++;
				else if ((await storePhoto(expected.id, picture)) === 'stored') p.stored++;
				else p.already++;
			} catch {
				p.failed++;
			}
			p.done++;
			progress = { ...p };
		}
		uploading = false;
	}

	/** A SQL dump only names its files; the admin points at the folder and they are matched by name. */
	async function onPhotosPicked(event: Event) {
		const files = (event.currentTarget as HTMLInputElement).files;
		if (!files) return;
		const byName = new Map<string, File>();
		for (const f of files) byName.set(f.name, f);
		await storeAll(async (photo) => byName.get(photo.file) ?? null);
	}

	/** A JSON export and a vCard carry their pictures; the server hands each one back out. */
	async function fetchEmbeddedPhotos() {
		await storeAll(async (photo) => {
			const res = await fetch(
				`/settings/import/photos?token=${encodeURIComponent(token)}&photoId=${encodeURIComponent(photo.id)}`
			);
			if (res.status === 404 || res.status === 409) return null;
			if (!res.ok) throw new Error(`The picture could not be read (${res.status}).`);
			return await res.blob();
		});
	}
</script>

<section class="flex flex-col gap-4">
	{@render children()}

	{#if photos.length > 0}
		<h2 class="text-sm font-medium text-fg-muted">
			{t('import.photos', { count: photos.length })}
		</h2>
		{#if embedded}
			<p class="text-sm text-fg-muted">{t('import.photos.embedded')}</p>
			<!-- The count is in the heading right above; the button says what it does. -->
			<Button variant="primary" onclick={fetchEmbeddedPhotos} disabled={uploading}>
				{uploading ? t('import.photos.storing') : t('import.photos.store')}
			</Button>
		{:else}
			<p class="text-sm text-fg-muted">{t('import.photos.folder')}</p>
			<input
				type="file"
				webkitdirectory
				multiple
				accept="image/*"
				onchange={onPhotosPicked}
				disabled={uploading}
				class="rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg"
				aria-label={t('import.photos.folderLabel')}
			/>
		{/if}
		{#if progress}
			<div class="flex flex-col gap-1" data-testid="photo-progress">
				<progress max={progress.total} value={progress.done} class="w-full"></progress>
				<p class="text-sm text-fg-muted">{t('import.progress', progress)}</p>
			</div>
		{/if}
	{/if}

	<form method="POST" action="?/finish" class="flex justify-end">
		<input type="hidden" name="token" value={token} />
		<Button variant="primary" disabled={uploading}>{t('import.finish')}</Button>
	</form>
</section>
