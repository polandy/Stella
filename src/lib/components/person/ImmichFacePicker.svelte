<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import PhotoCropper from '$lib/components/ui/PhotoCropper.svelte';
	import { tick, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { faceChoice, type FaceHolder } from '$lib/immich/face-pick';
	import type { GlimpsePhoto } from '$lib/immich/strip';
	import type { CropRect } from '$lib/media/crop';
	import { loadFullPicture } from '$lib/media/send-cut';
	import { sendImmichPhoto } from '$lib/media/send-immich-photo';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { submitAction } from '$lib/undo/submit-action';
	import { ImmichPhotos } from './immich-photos.svelte';

	/*
	 * *Find in Immich* (docs/02 §2.24.2): the faces in the household's Immich, searched
	 * by the person's name, and one tap links the face that is them. The face does the work — you
	 * recognise your aunt faster than you read her name — so faces lead and names follow. Faces
	 * come through Stella's signed proxy, never from Immich directly: each arrives with a URL
	 * signed for this person's picker (docs/04 ADR-097).
	 *
	 * Opened by the Photos card's menu through `open`; a pick is a plain form post, so the page
	 * reloads with the link and the dialog goes with it. Opened from the picture's chooser
	 * (docs/02 §2.24.6) it is given `onlinked` instead: the link is posted in place, the page's
	 * data reloaded, and the chooser opens again on the person's Immich photos. A face already linked to another person
	 * stays in the grid — leaving it out would read as "Immich does not know them" — but cannot
	 * be linked, and says whose it is when the member may see that person (docs/04 ADR-096).
	 *
	 * A face held by someone the member sees opens that person's photos instead (`faceChoice`):
	 * a group photo may hold this person, unlinked or nameless in Immich. A tap on one opens the
	 * cropper, and the square becomes *this* person's picture — *Use as photo* (§2.24.6), with
	 * tokens the server signed for this person and the other's link. *Back to faces* returns.
	 */
	interface Props {
		contactId: string;
		/** The person's name as the page shows it, for the title. */
		name: string;
		/** What the search starts with: the person's first and last name. */
		searchName: string;
		/** Bindable: set to open the dialog; the dialog clears it when it closes. */
		open?: boolean;
		/** When given, a pick links in place and this follows, instead of the page navigating. */
		onlinked?: () => void;
		/**
		 * Whether the person wears a photo now: one taken from someone else's photos then drops it
		 * back into the gallery, and a toast says so.
		 */
		hasPhoto?: boolean;
	}
	let {
		contactId,
		name,
		searchName,
		open = $bindable(false),
		onlinked,
		hasPhoto = false
	}: Props = $props();

	/** A face as the faces route sends it; `linkedTo` is set when another person has it already. */
	interface Face {
		id: string;
		name: string;
		linkedTo: FaceHolder | null;
		/** The face's thumbnail, through Stella's signed proxy. */
		faceUrl: string;
	}

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	let dialog: HTMLDialogElement | undefined = $state();
	let query = $state('');
	let faces = $state<Face[]>([]);
	let error = $state<string | null>(null);
	let searching = $state(false);
	/** Searched at least once since opening, so "nobody" is only said after an answer. */
	let answered = $state(false);
	/* Only the latest search may fill the list: an earlier, slower answer arriving last would
	 * otherwise show faces for a name no longer in the field. */
	let latest = 0;

	async function search() {
		const asked = ++latest;
		searching = true;
		error = null;
		try {
			const response = await fetch(
				`/contacts/${contactId}/immich/faces?q=${encodeURIComponent(query)}`
			);
			if (!response.ok) throw new Error(`faces answered ${response.status}`);
			const body = (await response.json()) as { faces: Face[]; error: string | null };
			if (asked !== latest) return;
			faces = body.faces;
			error = body.error;
		} catch {
			if (asked !== latest) return;
			faces = [];
			error = t('immich.error.unreachable');
		} finally {
			if (asked === latest) {
				searching = false;
				answered = true;
			}
		}
	}

	$effect(() => {
		if (!open || !dialog || dialog.open) return;
		// Every opening starts on the faces, wherever the last one was left.
		untrack(() => void backToFaces());
		query = searchName;
		faces = [];
		answered = false;
		dialog.showModal();
		void search();
	});

	/*
	 * Someone else's photos, opened from a face they hold. The list is asked for this person's page
	 * (`?of=`), so every photo in it is signed for this person and the other's link.
	 */
	let browsing = $state<{ contactId: string; name: string } | null>(null);
	const browsed = new ImmichPhotos();
	let stopBrowsing: (() => void) | null = null;
	let browseHeading: HTMLHeadingElement | undefined = $state();
	let searchInput: HTMLInputElement | undefined = $state();

	async function browse(holder: { contactId: string; name: string }) {
		stopBrowsing?.();
		error = null;
		browsing = holder;
		stopBrowsing = browsed.load(contactId, { of: holder.contactId });
		// The face that was tapped is gone from the screen; focus goes where the photos begin.
		await tick();
		browseHeading?.focus();
	}

	async function backToFaces() {
		const wasBrowsing = browsing !== null;
		stopBrowsing?.();
		stopBrowsing = null;
		browsing = null;
		error = null;
		if (!wasBrowsing) return;
		await tick();
		searchInput?.focus();
	}

	const describe = (photo: GlimpsePhoto, of: string) =>
		photo.takenOn === null
			? t('contact.photos.of', { name: of })
			: t('immich.strip.photo', { date: dayLabel(i18n, photo.takenOn) });

	/** The picture in the cropper, and the signed preview it was fetched from. */
	let picked = $state<{ picture: Blob; previewUrl: string } | null>(null);
	let busy = $state(false);

	async function pickPhoto(photo: GlimpsePhoto) {
		if (busy) return;
		busy = true;
		error = null;
		try {
			picked = { picture: await loadFullPicture(photo.previewUrl), previewUrl: photo.previewUrl };
		} catch {
			error = t('immich.viewer.useFailed');
		} finally {
			busy = false;
		}
	}

	/** The square becomes this person's picture: the path *Use as photo* takes (§2.24.6). */
	async function keep(crop: CropRect) {
		const chosen = picked;
		picked = null;
		if (!chosen) return;
		const hadPhoto = hasPhoto;
		busy = true;
		try {
			await sendImmichPhoto(contactId, chosen.previewUrl, chosen.picture, crop);
			dialog?.close();
			await invalidateAll();
			if (hadPhoto) removals.notify(t('components.photo.previousKept'));
		} catch {
			error = t('immich.viewer.useFailed');
		} finally {
			busy = false;
		}
	}

	function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		void search();
	}

	/** A pick posted in place, for a caller that carries on from the link (`onlinked`). */
	async function linkInPlace(event: SubmitEvent) {
		if (!onlinked) return;
		event.preventDefault();
		const done = onlinked;
		error = null;
		try {
			const body = new FormData(event.currentTarget as HTMLFormElement);
			await submitAction(fetch, `/contacts/${encodeURIComponent(contactId)}?/linkImmich`, body, {
				keepalive: false
			});
			dialog?.close();
			await invalidateAll();
			done();
		} catch {
			error = t('common.somethingWentWrong');
		}
	}

	const INPUT =
		'min-w-0 flex-1 rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg';
	const FACE_BUTTON =
		'flex w-full flex-col items-center gap-1.5 rounded-control p-1.5 text-center hover:bg-bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
</script>

<dialog
	bind:this={dialog}
	aria-label={t('immich.picker.title', { name })}
	onclose={() => (open = false)}
	onclick={(event) => event.target === event.currentTarget && dialog?.close()}
	class="m-auto w-full max-w-lg rounded-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm"
	data-testid="immich-picker"
>
	<div class="flex max-h-[85vh] flex-col gap-3 p-4">
		<div class="flex items-center justify-between gap-3">
			<h2 class="text-base font-semibold">{t('immich.picker.title', { name })}</h2>
			<Button variant="ghost" size="sm" onclick={() => dialog?.close()}>{t('common.close')}</Button>
		</div>

		{#if browsing}
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3
					bind:this={browseHeading}
					tabindex="-1"
					class="text-sm font-semibold text-fg outline-none"
				>
					{t('immich.picker.photosOf', { name: browsing.name })}
				</h3>
				<Button variant="ghost" size="sm" icon="back" onclick={backToFaces}>
					{t('immich.picker.backToFaces')}
				</Button>
			</div>
			<FormError message={error} />
			<div class="-mx-1 flex-1 overflow-y-auto px-1" data-testid="immich-browse">
				{#if browsed.phase === 'loading'}
					<p class="text-xs text-fg-subtle" role="status">{t('immich.strip.loading')}</p>
				{:else if browsed.photos.length === 0}
					<p class="text-sm text-fg-subtle" data-testid="immich-browse-none">
						{t('immich.picker.photosNone', { name: browsing.name })}
					</p>
				{:else}
					<p class="mb-2 text-sm text-fg-muted">{t('immich.picker.photosHint', { name })}</p>
					<ul class="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="immich-browse-photos">
						{#each browsed.photos as photo (photo.id)}
							<li>
								<button
									type="button"
									onclick={() => pickPhoto(photo)}
									aria-busy={busy}
									class="block w-full rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
								>
									<img
										src={photo.thumbnailUrl}
										alt={describe(photo, browsing.name)}
										class="aspect-square w-full rounded-control bg-bg-sunken object-cover"
										loading="lazy"
									/>
								</button>
							</li>
						{/each}
					</ul>
					{#if browsed.nextCursor !== null}
						<div class="mt-3 flex justify-center">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => browsed.showMore()}
								disabled={browsed.loadingMore}
							>
								{t('immich.strip.showMore')}
							</Button>
						</div>
					{/if}
				{/if}
			</div>
		{:else}
			<form {onsubmit} role="search" class="flex gap-2">
				<input
					type="search"
					bind:this={searchInput}
					bind:value={query}
					aria-label={t('immich.picker.search')}
					placeholder={t('immich.picker.search')}
					class={INPUT}
				/>
				<Button type="submit" size="sm" icon="search" disabled={searching}
					>{t('common.search')}</Button
				>
			</form>

			<FormError message={error} />
			{#if searching}
				<p class="text-xs text-fg-subtle" role="status">{t('immich.picker.searching')}</p>
			{/if}

			<div class="-mx-1 flex-1 overflow-y-auto px-1">
				{#if faces.length > 0}
					<p class="mb-2 text-sm text-fg-muted">{t('immich.picker.hint')}</p>
					<ul class="grid grid-cols-3 gap-3 sm:grid-cols-4" data-testid="immich-faces">
						{#each faces as face (face.id)}
							{@const choice = faceChoice(face.linkedTo, contactId)}
							<li>
								{#if choice.kind === 'browse'}
									<!-- Theirs, not to link again — but their photos may hold this person. -->
									<button
										type="button"
										onclick={() => browse(choice)}
										aria-label={t('immich.picker.browse', { name: choice.name })}
										class={FACE_BUTTON}
										data-testid="immich-face-taken"
									>
										<img
											src={face.faceUrl}
											alt=""
											class="aspect-square w-full rounded-full bg-bg-sunken object-cover"
											loading="lazy"
										/>
										<span class="w-full truncate text-xs text-fg">{face.name}</span>
										<span class="w-full text-[0.6875rem] leading-tight text-fg-muted">
											{t('immich.picker.linkedTo', { name: choice.name })}
										</span>
									</button>
								{:else if choice.kind === 'taken'}
									<div
										class="flex w-full flex-col items-center gap-1.5 p-1.5 text-center opacity-60"
										data-testid="immich-face-taken"
									>
										<img
											src={face.faceUrl}
											alt=""
											class="aspect-square w-full rounded-full bg-bg-sunken object-cover grayscale"
											loading="lazy"
										/>
										<span class="w-full truncate text-xs text-fg">{face.name}</span>
										<span class="w-full text-[0.6875rem] leading-tight text-fg-muted">
											{choice.name === null
												? t('immich.picker.linkedElsewhere')
												: t('immich.picker.linkedTo', { name: choice.name })}
										</span>
									</div>
								{:else}
									<form method="POST" action="?/linkImmich" onsubmit={linkInPlace}>
										<input type="hidden" name="immichPersonId" value={face.id} />
										<button
											type="submit"
											aria-label={t('immich.picker.link', { immichName: face.name, name })}
											class={FACE_BUTTON}
										>
											<img
												src={face.faceUrl}
												alt=""
												class="aspect-square w-full rounded-full bg-bg-sunken object-cover"
												loading="lazy"
											/>
											<span class="w-full truncate text-xs text-fg">{face.name}</span>
										</button>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				{:else if answered && !searching && !error}
					<p class="text-sm text-fg-subtle" data-testid="immich-no-faces">
						{t('immich.picker.none')}
					</p>
				{/if}
			</div>
		{/if}
	</div>
</dialog>
<!-- Outside the dialog, so it opens over it and *Cancel* comes back to the photos. -->
<PhotoCropper
	file={picked?.picture ?? null}
	initial={null}
	onconfirm={keep}
	oncancel={() => (picked = null)}
/>
