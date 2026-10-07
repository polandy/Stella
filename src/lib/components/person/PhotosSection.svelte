<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { invalidateAll } from '$app/navigation';
	import type { JsonCommand } from '$lib/commands/commands';
	import { cardShape } from '$lib/contacts/empty-cards';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { processImage } from '$lib/image/process-image';
	import { photoDay, type Dated } from '$lib/image/taken-at';
	import { thumbnailUrl } from '$lib/media/urls';
	import { isKept, type KeptOf, type KeptPhoto } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { photoAfterKey } from '$lib/ui/photo-walk';
	import { tick } from 'svelte';
	import { ulid } from 'ulid';
	import ImmichFacePicker from './ImmichFacePicker.svelte';
	import ImmichLine from './ImmichLine.svelte';
	import ImmichStrip from './ImmichStrip.svelte';
	import { stripViews, viewShown, type StripView } from '$lib/immich/together';
	import { INPUT } from './inputs';
	import PhotoLightbox from './PhotoLightbox.svelte';
	import type { PersonForm, PersonPageData } from './types';

	// What was taken (docs/02 §2.14): the person page's gallery card and its lightbox.
	let {
		data,
		form,
		together = $bindable({ askedByRow: null, shown: null })
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Which pair a relationship row asked for, and which the strip shows (docs/02 §2.24.8). */
		together?: { askedByRow: string | null; shown: string | null };
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	/*
	 * The gallery (docs/02 §2.14). Photos are downscaled and EXIF-stripped in the browser
	 * before upload, so nothing leaves the device carrying a location. The lightbox is one
	 * overlay reused for whichever photo is open; `openPhoto` is an index into the grid so
	 * the arrow keys can walk it.
	 */
	let picked = $state<File[]>([]);
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let openPhoto = $state<number | null>(null);
	const openedPhoto = $derived(openPhoto === null ? null : (data.gallery[openPhoto] ?? null));

	/** When a gallery photo was taken, else added, in the viewer's language (docs/02 §2.14). */
	const photoDate = (photo: Dated): string => dayLabel(i18n, photoDay(photo));

	/*
	 * An upload is saved through the outbox like every addition (docs/04 ADR-076):
	 * the photos, processed first, go with a `gallery.add` naming the person, and are
	 * kept on the device when Stella cannot take them — shown above the grid until they are sent.
	 */
	const keptGallery = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'gallery.add'> =>
				isKept(item, 'gallery.add') && item.command.payload.contactId === c.id
		)
	);
	async function uploadPhotos(event: SubmitEvent) {
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		if (picked.length === 0) return;
		uploading = true;
		uploadError = null;
		try {
			const photos: KeptPhoto[] = [];
			for (const file of picked) photos.push({ id: ulid(), ...(await processImage(file)) });
			const visibility =
				new FormData(formEl).get('visibility') === 'private' ? 'private' : 'shared';
			const command: JsonCommand = {
				id: ulid(),
				type: 'gallery.add',
				payload: { contactId: c.id, visibility },
				issuedAt: Date.now()
			};
			if (!reachability.reachable) {
				await outbox.add(command, photos, c.displayName);
			} else {
				const delivery = await outbox.submit(command, photos, c.displayName);
				if (delivery.status === 'refused') {
					uploadError = delivery.reason;
					return;
				}
				if (delivery.status === 'applied') await invalidateAll();
			}
			picked = [];
			formEl.reset();
		} catch {
			uploadError = t('contact.photos.uploadFailed');
		} finally {
			uploading = false;
		}
	}

	/*
	 * Immich (docs/02 §2.24.2, §2.24.3): a quiet menu on the card — *Find in Immich*, or
	 * *Unlink* once linked — and, for a linked person, a line and a strip of their latest photos
	 * under the gallery. None of it exists without Immich, and none offline, where nothing from
	 * Immich is shown (docs/02 §2.24.3).
	 */
	let pickerOpen = $state(false);
	const showImmich = $derived(data.immich !== null && reachability.reachable);
	/** The search the picker starts with: the name, without a nickname Immich would not know. */
	const immichSearchName = $derived(
		[c.firstName, c.lastName].filter(Boolean).join(' ') || c.displayName
	);

	/*
	 * Photos together (docs/02 §2.24.8): chips over the strip — *All photos*, *You and Julia* when
	 * the viewer's own person is linked too, and the pair a relationship row's *Together* asked for.
	 * With only *All photos* there are no chips at all.
	 */
	const stripChoices = $derived(
		data.immich?.linked
			? stripViews({
					pageContactId: c.id,
					selfContactId: data.user.selfContactId,
					togetherWith: data.immich.togetherWith,
					askedByRow: together.askedByRow
				})
			: []
	);
	const stripShown = $derived(viewShown(stripChoices, together.shown));
	const ownFirstName = $derived(c.firstName || c.displayName);
	const firstNameOf = (contactId: string) => {
		const person = data.people.find((candidate) => candidate.id === contactId);
		return person?.firstName || person?.displayName || '';
	};
	/** Whether the pair is the viewer and someone, said *you* rather than by name. */
	const withViewer = (view: StripView & { contactId: string }) =>
		view.kind === 'withYou' || c.id === data.user.selfContactId;
	/** The other one of a pair: the page's person, when the page is the viewer's own. */
	const otherOf = (view: StripView & { contactId: string }) =>
		view.kind === 'withYou' ? ownFirstName : firstNameOf(view.contactId);
	function chipLabel(view: StripView): string {
		if (view.kind === 'own') return t('immich.together.own');
		if (withViewer(view)) return t('immich.together.withYou', { name: otherOf(view) });
		return t('immich.together.pair', { first: ownFirstName, second: firstNameOf(view.contactId) });
	}
	const stripTogether = $derived.by(() => {
		const view = stripShown;
		if (view.kind === 'own') return null;
		const label = withViewer(view)
			? t('immich.together.stripWithYou', { name: otherOf(view) })
			: t('immich.together.stripPair', {
					first: ownFirstName,
					second: firstNameOf(view.contactId)
				});
		return { contactId: view.contactId, label };
	});
	const chooseView = (view: StripView) => {
		together = { ...together, shown: view.kind === 'own' ? null : view.contactId };
	};
	const isShown = (view: StripView) =>
		view.kind === stripShown.kind &&
		(view.kind === 'own' || (stripShown.kind !== 'own' && view.contactId === stripShown.contactId));

	// The grid's buttons, so closing the photo hands focus back to the one now showing.
	const thumbnails: HTMLButtonElement[] = $state([]);

	function onPhotoKeydown(event: KeyboardEvent) {
		if (openPhoto === null) return;
		const target = event.target as HTMLElement;
		const typing = target.matches('input, textarea') || target.isContentEditable;
		const next = photoAfterKey({
			key: event.key,
			at: openPhoto,
			count: data.gallery.length,
			typing
		});
		if (next !== null) openPhoto = next;
	}

	function closePhoto() {
		const at = openPhoto;
		openPhoto = null;
		// After the dialog has gone: until then the grid is inert and cannot take focus.
		if (at !== null) void tick().then(() => thumbnails[at]?.focus());
	}

	/*
	 * No photo, none waiting to be sent, no group photo and no Immich line under them: the card
	 * is one line (docs/05 §5.5). The Immich menu stays in that line, beside the add button.
	 */
	const holdsSomething = $derived(
		data.gallery.length > 0 ||
			keptGallery.length > 0 ||
			data.groupPhotos.length > 0 ||
			(showImmich && (data.immich?.linked === true || Boolean(form?.immichError)))
	);
</script>

<Section
	id={sectionAnchor('photos')}
	title={t('contact.section.photos')}
	count={data.gallery.length}
	addLabel={t('contact.photos.add')}
	empty={cardShape('photos', holdsSomething) === 'line' ? t('contact.photos.none') : undefined}
	error={form?.photoError ?? uploadError}
>
	{#snippet action()}
		{#if showImmich && data.immich}
			<MenuButton label={t('immich.menu.label')} align="end">
				{#snippet trigger()}{t('immich.menu.trigger')}{/snippet}
				{#snippet children({ close })}
					{#if data.immich?.linked}
						<form method="POST" action="?/unlinkImmich" class="contents">
							<button
								type="submit"
								role="menuitem"
								class="flex items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft"
							>
								<Icon name="unlink" size={14} />{t('immich.menu.unlink')}
							</button>
						</form>
					{:else}
						<button
							type="button"
							role="menuitem"
							onclick={() => {
								close();
								pickerOpen = true;
							}}
							class="flex items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft"
						>
							<Icon name="search" size={14} />{t('immich.menu.find')}
						</button>
					{/if}
				{/snippet}
			</MenuButton>
		{/if}
	{/snippet}
	{#if keptGallery.length > 0}
		<ul class="mb-3 flex flex-col gap-2" data-testid="kept-gallery">
			{#each keptGallery as item (item.command.id)}
				<li><KeptItem {item} /></li>
			{/each}
		</ul>
	{/if}
	{#if data.gallery.length > 0}
		<ul class="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="photo-grid">
			{#each data.gallery as p, index (p.id)}
				<li class="relative">
					<button
						type="button"
						bind:this={thumbnails[index]}
						onclick={() => (openPhoto = index)}
						class="relative block w-full overflow-hidden rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
					>
						<img
							src={thumbnailUrl(p.id)}
							alt={p.caption ?? t('contact.photos.of', { name: c.displayName })}
							class="aspect-square w-full object-cover"
							loading="lazy"
						/>
						{#if p.pinnedAt !== null}
							<!-- A star, not a tint: the pin reads without colour (docs/05 §5.10). -->
							<span
								class="pointer-events-none absolute top-1 left-1 rounded-full bg-bg/80 p-1 text-primary"
								data-testid="photo-favourite"
							>
								<Icon name="pinned" size={11} />
							</span>
							<span class="sr-only">{t('contact.photos.favourite')}</span>
						{/if}
						<span
							class="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/65 to-transparent px-1.5 pt-3 pb-1 text-left text-[0.6875rem] font-medium text-white"
							aria-hidden="true"
						>
							{photoDate(p)}
						</span>
					</button>
					{#if p.visibility === 'private'}
						<span
							class="absolute top-1 right-1 rounded-full bg-bg/80 p-1 text-fg-muted"
							title={t('contact.photos.privateHint')}
						>
							<Icon name="private" size={11} />
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if data.groupPhotos.length > 0}
		<!-- Every group photo their picture was cut from, now and before (docs/02 §2.14). -->
		<div class="mt-4 flex flex-col gap-2" data-testid="on-group-photos">
			<h3 class="text-sm font-semibold text-fg">
				{t('contact.photos.onGroupPhotos')}
			</h3>
			<ul class="flex gap-2 overflow-x-auto pb-1">
				{#each data.groupPhotos as g (g.id)}
					<li class="w-28 shrink-0">
						<a
							href="/circles/{g.circleId}"
							class="flex flex-col gap-1 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
						>
							<img
								src={thumbnailUrl(g.id)}
								alt={t('contact.photos.groupPhotoOf', { circle: g.circleName })}
								class="aspect-[4/3] w-full rounded-control bg-bg-sunken object-cover"
								loading="lazy"
							/>
							<span class="truncate text-xs text-fg-muted">{g.circleName}</span>
							<span class="truncate text-[0.6875rem] text-fg-subtle">{photoDate(g)}</span>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if showImmich}
		<ImmichLine person={data.immichPerson} error={form?.immichError ?? null} />
		{#if data.immich?.linked}
			{#if stripChoices.length > 1}
				<div
					class="mt-2 flex flex-wrap gap-1.5"
					role="group"
					aria-label={t('immich.together.label')}
					data-testid="immich-together"
				>
					{#each stripChoices as view (view.kind === 'own' ? 'own' : view.contactId)}
						<button
							type="button"
							aria-pressed={isShown(view)}
							onclick={() => chooseView(view)}
							class="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-fg-muted transition-colors hover:border-primary hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-fg"
						>
							{chipLabel(view)}
						</button>
					{/each}
				</div>
			{/if}
			<ImmichStrip
				contactId={c.id}
				name={c.displayName}
				hasPhoto={c.avatarPhotoId !== null}
				together={stripTogether}
			/>
		{/if}
	{/if}

	{#snippet editor()}
		<form onsubmit={uploadPhotos} class="flex flex-wrap items-end gap-3">
			<label class="flex flex-1 flex-col gap-1 text-sm">
				<span class="text-fg-muted">{t('contact.photos.pictures')}</span>
				<input
					name="files"
					type="file"
					accept="image/*"
					multiple
					required
					onchange={(e) => (picked = Array.from(e.currentTarget.files ?? []))}
					class={INPUT}
				/>
			</label>
			<fieldset class="flex items-center gap-3 text-sm">
				<legend class="sr-only">{t('common.visibility')}</legend>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="shared" checked />
					{t('common.shared')}
				</label>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="private" />
					{t('common.private')}
				</label>
			</fieldset>
			<Button variant="primary" size="sm" disabled={uploading}>
				{uploading ? t('contact.photos.adding') : t('common.add')}
			</Button>
		</form>
	{/snippet}
</Section>

{#if showImmich}
	<ImmichFacePicker
		contactId={c.id}
		name={c.displayName}
		searchName={immichSearchName}
		bind:open={pickerOpen}
	/>
{/if}

<PhotoLightbox {data} {openedPhoto} {photoDate} {closePhoto} {onPhotoKeydown} />
