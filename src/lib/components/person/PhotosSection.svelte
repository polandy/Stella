<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import KeptItem from '$lib/components/pwa/KeptItem.svelte';
	import MenuButton from '$lib/components/ui/MenuButton.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import { invalidateAll } from '$app/navigation';
	import type { JsonCommand } from '$lib/commands/commands';
	import { cardShape } from '$lib/people/empty-cards';
	import { sectionAnchor } from '$lib/people/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { processImage } from '$lib/media/process-image';
	import { isKept, type KeptOf, type KeptPhoto } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { asksForMatchHint, matchHintName, shownMatchHint } from '$lib/immich/match-hint';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { deferredRemoval } from '$lib/undo/deferred-removal';
	import { removalKey } from '$lib/undo/keys';
	import { ulid } from 'ulid';
	import GroupPhotos from './GroupPhotos.svelte';
	import ImmichFacePicker from './ImmichFacePicker.svelte';
	import ImmichLine from './ImmichLine.svelte';
	import { ImmichMatchHint as MatchHint } from './immich-match-hint.svelte';
	import ImmichMatchHint from './ImmichMatchHint.svelte';
	import { INPUT } from './inputs';
	import PhotoCardBody from './PhotoCardBody.svelte';
	import { PhotoCardState, type PhotoView } from './photo-card-state.svelte';
	import PhotoTabs from './PhotoTabs.svelte';
	import type { PersonForm, PersonPageData } from './types';

	// What was taken (docs/02 §2.14, §2.24.3): the person page's Photos card and its lightbox.
	let {
		data,
		form,
		view = $bindable({ tab: 'all', expanded: false, askedByRow: null, shown: null })
	}: {
		data: PersonPageData;
		form: PersonForm;
		/**
		 * Which tab the card shows, whether *All* was opened out, and which pair a relationship
		 * row asked for and the Immich tab shows (docs/02 §2.24.8) — the page's, so a row's
		 * *Together* can switch it and another person's page starts afresh.
		 */
		view?: PhotoView;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const removals = useRemovals();
	const card = new PhotoCardState(() => ({
		data,
		view,
		online: reachability.reachable,
		held: (photoId) => removals.isPending(removalKey('photo', photoId))
	}));
	const PANEL = 'photo-panel';

	/*
	 * The upload (docs/02 §2.14). Photos are downscaled and EXIF-stripped in the browser before
	 * upload, so nothing leaves the device carrying a location.
	 */
	let picked = $state<File[]>([]);
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);

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
	 * *Unlink* once linked — and, for a linked person, their latest photos in *All* and the
	 * Immich tab, and a line under them. None of it exists without Immich, and none offline,
	 * where nothing from Immich is shown (docs/02 §2.24.3).
	 */
	let pickerOpen = $state(false);
	const showImmich = $derived(card.showImmich);
	/** The search the picker starts with: the name, without a nickname Immich would not know. */
	const immichSearchName = $derived(
		[c.firstName, c.lastName].filter(Boolean).join(' ') || c.displayName
	);

	/*
	 * The suggestion for an unlinked person (docs/02 §2.24.7): the face *Find your people* would
	 * link in one tap, asked for after the page has loaded. Nothing is reserved for it; it
	 * arrives at the card's foot. *Ignore* is the list's lasting no, held for the undo window
	 * like any removal (docs/02 §2.23) — the row goes at once and comes back on *Undo*.
	 */
	const hintSituation = $derived({
		immichOn: data.immich !== null,
		online: reachability.reachable,
		linked: data.immich?.linked === true
	});
	const hint = new MatchHint(() => ({ contactId: c.id, asks: asksForMatchHint(hintSituation) }));
	const hintIgnoreKey = $derived(removalKey('immich-ignore', c.id));
	const hintFace = $derived(
		shownMatchHint({
			...hintSituation,
			answer: hint.answer,
			ignored:
				removals.isPending(hintIgnoreKey) ||
				(hint.answer !== null && hint.ignoredPair === `${c.id}/${hint.answer.personId}`)
		})
	);
	function ignoreHint(event: SubmitEvent) {
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		const pair = `${c.id}/${new FormData(formEl).get('immichPersonId')}`;
		const removal = deferredRemoval(
			{
				kind: 'immich-ignore',
				id: c.id,
				label: t('immich.match.ignoredToast'),
				// Absolute: the window may close after the reader has moved on to another page.
				action: `/contacts/${encodeURIComponent(c.id)}?/ignoreImmichMatch`,
				body: new FormData(formEl)
			},
			{ fetch, reload: invalidateAll }
		);
		removals.remove({
			...removal,
			// The store lets go of the key as the window closes, before the post: the row stays
			// away meanwhile, and comes back only if the post fails.
			commit: async () => {
				hint.ignoredPair = pair;
				try {
					await removal.commit();
				} catch (error) {
					hint.ignoredPair = null;
					throw error;
				}
			}
		});
	}

	/*
	 * No photo, none waiting to be sent, no group photo and no Immich line under them: the card
	 * is one line (docs/05 §5.5). The Immich menu stays in that line, beside the add button.
	 * The suggestion is not content: it arrives late, and a line turning into a card under the
	 * reader's eyes would move its own header — so it hangs under the line instead (`footer`).
	 */
	const holdsSomething = $derived(
		card.gallery.length > 0 ||
			keptGallery.length > 0 ||
			data.groupPhotos.length > 0 ||
			(showImmich && (data.immich?.linked === true || Boolean(form?.immichError)))
	);
	/** The tabs, once there is a grid for them to choose: a gallery photo, or a linked person. */
	const hasGrid = $derived(card.gallery.length > 0 || card.linked);
</script>

<Section
	id={sectionAnchor('photos')}
	title={t('contact.section.photos')}
	addLabel={t('contact.photos.add')}
	empty={cardShape('photos', holdsSomething) === 'line' ? t('contact.photos.none') : undefined}
	error={form?.photoError ?? uploadError}
>
	{#snippet action()}
		{#if holdsSomething && hasGrid}
			<PhotoTabs
				tabs={card.tabs}
				chosen={card.tab}
				stellaCount={card.gallery.length}
				immichCount={card.immichCount}
				panel={PANEL}
				onchoose={(tab) => (view = { ...view, tab })}
			/>
		{/if}
	{/snippet}
	{#snippet menu()}
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
	{#if hasGrid}
		<PhotoCardBody {data} {card} bind:view panel={PANEL} />
	{/if}
	{#if data.groupPhotos.length > 0}
		<GroupPhotos photos={data.groupPhotos} />
	{/if}
	{#if showImmich}
		<ImmichLine person={data.immichPerson} error={form?.immichError ?? null} />
	{/if}

	{#snippet footer()}
		{#if hintFace}
			<ImmichMatchHint
				face={hintFace}
				askName={matchHintName(c)}
				contactName={c.displayName}
				onchoose={() => (pickerOpen = true)}
				onignore={ignoreHint}
			/>
		{/if}
	{/snippet}

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
