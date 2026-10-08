<script lang="ts" module>
	import type { CropRect } from '$lib/media/crop';

	/** A photo of one of the person's circles their picture can be cut from. */
	export interface GroupPhotoChoice {
		id: string;
		circleName: string;
		/** The square they wear of it now, so choosing again starts there. */
		crop: CropRect | null;
	}
</script>

<script lang="ts">
	import { useI18n } from '$lib/i18n/context.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import type { GlimpsePhoto } from '$lib/immich/strip';
	import { thumbnailUrl } from '$lib/media/urls';
	import Button from '../ui/Button.svelte';
	import { fetchGlimpse } from './immich-glimpse';

	/*
	 * Where a person's new picture comes from (docs/02 §2.14, §2.24.6): a file, a group photo of
	 * one of their circles (docs/02 §2.14), or — with Immich — one of their
	 * latest Immich photos, the same signed list the Photos card shows. A person not
	 * linked yet gets *Find in Immich* instead, the face picker; once linked, their photos are here.
	 * Every pick hands back to `AvatarUploader`, which opens the cropper; this only lists.
	 */

	interface Props {
		contactId: string;
		name: string;
		groupPhotos: readonly GroupPhotoChoice[];
		/** The Immich section: their photos, the face picker, or none (`$lib/people/avatar-chooser`). */
		immich: 'photos' | 'find' | null;
		/** Bindable: set to open the dialog; the dialog clears it when it closes. */
		open?: boolean;
		onfile: () => void;
		ongroup: (photo: GroupPhotoChoice) => void;
		onimmich: (photo: GlimpsePhoto) => void;
		onfind: () => void;
	}
	let {
		contactId,
		name,
		groupPhotos,
		immich,
		open = $bindable(false),
		onfile,
		ongroup,
		onimmich,
		onfind
	}: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;

	let dialog: HTMLDialogElement | undefined = $state();
	/** Their latest Immich photos, once Immich answered. */
	let immichPhotos = $state<GlimpsePhoto[]>([]);
	let immichPhase = $state<'loading' | 'shown' | 'failed'>('loading');

	$effect(() => {
		if (!open || !dialog || dialog.open) return;
		dialog.showModal();
		if (immich !== 'photos') return;
		// Asked each time the chooser opens: the signed URLs are fresh, and a new link shows at once.
		immichPhase = 'loading';
		immichPhotos = [];
		const asked = contactId;
		void fetchGlimpse(asked, null).then((page) => {
			if (asked !== contactId) return;
			if (page?.state === 'photos') {
				immichPhotos = page.photos;
				immichPhase = 'shown';
			} else {
				immichPhase = 'failed';
			}
		});
	});

	/** Close first, so the cropper or the picker opened next sits alone on the screen. */
	function then(pick: () => void) {
		dialog?.close();
		pick();
	}

	const describe = (photo: GlimpsePhoto) =>
		photo.takenOn === null
			? t('contact.photos.of', { name })
			: t('immich.strip.photo', { date: dayLabel(i18n, photo.takenOn) });

	const HEADING = 'text-sm font-semibold text-fg';
	const TILE =
		'flex w-full flex-col gap-1 rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
</script>

<dialog
	bind:this={dialog}
	aria-label={t('components.photo.choose')}
	onclose={() => (open = false)}
	onclick={(event) => event.target === event.currentTarget && dialog?.close()}
	class="m-auto w-full max-w-md rounded-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm"
	data-testid="avatar-chooser"
>
	<div class="flex max-h-[85vh] flex-col gap-3 overflow-y-auto p-4">
		<div class="flex items-center justify-between gap-3">
			<h2 class="text-base font-semibold">{t('components.photo.choose')}</h2>
			<Button variant="ghost" size="sm" onclick={() => dialog?.close()}>{t('common.close')}</Button>
		</div>
		<Button variant="secondary" icon="photo" onclick={() => then(onfile)} class="self-start">
			{t('components.photo.fromFile')}
		</Button>

		{#if groupPhotos.length > 0}
			<h3 class={HEADING}>{t('components.photo.fromGroupPhoto')}</h3>
			<ul class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each groupPhotos as photo (photo.id)}
					<li>
						<button
							type="button"
							onclick={() => then(() => ongroup(photo))}
							class={TILE}
							data-testid="avatar-group-photo"
						>
							<img
								src={thumbnailUrl(photo.id)}
								alt=""
								class="aspect-square w-full rounded-control bg-bg-sunken object-cover"
								loading="lazy"
							/>
							<span class="truncate text-xs text-fg-muted">{photo.circleName}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if immich !== null}
			<h3 class={HEADING}>{t('components.photo.fromImmich')}</h3>
			{#if immich === 'find'}
				<p class="text-sm text-fg-muted">{t('components.photo.immichNotLinked', { name })}</p>
				<Button
					variant="secondary"
					size="sm"
					icon="search"
					onclick={() => then(onfind)}
					class="self-start"
				>
					{t('immich.menu.find')}
				</Button>
			{:else if immichPhase === 'loading'}
				<p class="text-xs text-fg-subtle" role="status">{t('immich.strip.loading')}</p>
			{:else if immichPhase === 'failed'}
				<p class="text-sm text-fg-subtle">{t('immich.row.unreachable')}</p>
			{:else if immichPhotos.length === 0}
				<p class="text-sm text-fg-subtle">{t('components.photo.immichNone', { name })}</p>
			{:else}
				<ul class="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="avatar-immich-photos">
					{#each immichPhotos as photo (photo.id)}
						<li>
							<button type="button" onclick={() => then(() => onimmich(photo))} class={TILE}>
								<img
									src={photo.thumbnailUrl}
									alt={describe(photo)}
									class="aspect-square w-full rounded-control bg-bg-sunken object-cover"
									loading="lazy"
								/>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</dialog>
