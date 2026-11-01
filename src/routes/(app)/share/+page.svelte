<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';
	import { ulid } from 'ulid';
	import ShareFields from '$lib/components/share/ShareFields.svelte';
	import SharedPreview from '$lib/components/share/SharedPreview.svelte';
	import SharePersonPicker from '$lib/components/share/SharePersonPicker.svelte';
	import ShareTargetPicker from '$lib/components/share/ShareTargetPicker.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PhotoCropper from '$lib/components/ui/PhotoCropper.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { CropRect } from '$lib/media/crop';
	import { processAvatar } from '$lib/media/process-avatar';
	import { processImage } from '$lib/media/process-image';
	import { defaultDay } from '$lib/stream/composer-reading';
	import type { KeptPhoto } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { forgetShare, readShare, type SharedPhoto } from '$lib/pwa/share-store';
	import { partsFromAddress } from '$lib/share/address';
	import { commandFor, type ShareDraft } from '$lib/share/command';
	import { deviceStorage, openedHere } from '$lib/share/opened-here';
	import { peopleToOffer } from '$lib/share/recent';
	import {
		choicesFor,
		giftIdeaFrom,
		momentBodyFrom,
		readShared,
		todoTitleFrom,
		type Shared,
		type ShareTarget
	} from '$lib/share/shared';
	import { useRemovals } from '$lib/undo/context.svelte';
	import type { PageData } from './$types';

	/*
	 * The share sheet (docs/02 §2.18.3, docs/design/screens/share.md): what another app shared,
	 * saved about one person as photos, a profile photo, a moment, a gift idea or a to-do. The
	 * service worker kept the share on the device and opened this page on `?pending=<id>`; a
	 * share the server took instead arrives as words in the address. Everything but the profile
	 * photo saves through the outbox, so offline it waits on the phone like any other entry.
	 */
	let { data }: { data: PageData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	/** Read on the device once the page is up: the worker's store is not the server's. */
	let loaded = $state(false);
	let pendingId: string | null = null;
	let gone = $state(false);
	let photosLeftBehind = $state(false);
	let shared = $state<Shared>({ kind: 'nothing' });
	let photos = $state<SharedPhoto[]>([]);
	let previews = $state<string[]>([]);

	let picked = $state<string | null>(null);
	let target = $state<ShareTarget | null>(null);
	let visibility = $state<'shared' | 'private'>('shared');
	let momentBody = $state('');
	let giftTitle = $state('');
	let giftUrl = $state('');
	let todoWords = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);
	let cropping = $state<Blob | null>(null);

	let offered = $state<typeof data.people>([]);

	onMount(async () => {
		offered = peopleToOffer(
			data.people,
			openedHere(deviceStorage, data.user.id).load(),
			data.lastTouched
		);
		pendingId = page.url.searchParams.get('pending');
		if (pendingId) {
			const share = await readShare(pendingId);
			if (share) {
				shared = readShared({ ...share, photoCount: share.photoCount });
				photos = share.photos;
				previews = share.photos.map((photo) => URL.createObjectURL(photo.blob));
			} else gone = true;
		} else {
			const fromAddress = partsFromAddress(page.url.searchParams);
			shared = readShared(fromAddress.parts);
			photosLeftBehind = fromAddress.photosLeftBehind;
		}
		if (shared.kind === 'words') {
			momentBody = momentBodyFrom(shared);
			({ title: giftTitle } = giftIdeaFrom(shared));
			giftUrl = shared.link ?? '';
			todoWords = shared.words.replace(/\s+/g, ' ').trim();
		}
		target = choicesFor(shared, { reachable: reachability.reachable })[0]?.id ?? null;
		loaded = true;
	});
	onDestroy(() => previews.forEach((url) => URL.revokeObjectURL(url)));

	const choices = $derived(choicesFor(shared, { reachable: reachability.reachable }));
	const photoCount = $derived(shared.kind === 'photos' ? shared.count : 0);
	const person = $derived(data.people.find((p) => p.id === picked) ?? null);
	// A target that became blocked — the connection gone while the profile photo was picked —
	// is not saved: Save waits for one that can be.
	const targetOpen = $derived(choices.some((c) => c.id === target && c.blockedBy === null));
	const canSave = $derived(person !== null && targetOpen && !saving);

	function draft(): ShareDraft | null {
		switch (target) {
			case 'moment':
				return { target, body: momentBody };
			case 'gift':
				return { target, title: giftTitle, url: giftUrl };
			case 'todo':
				return {
					target,
					title: todoTitleFrom({
						kind: 'words',
						words: todoWords,
						link: shared.kind === 'words' ? shared.link : null
					})
				};
			case 'gallery':
				return { target };
			default:
				return null;
		}
	}

	/** On the person's page, with the toast that says what happened. */
	async function finish(said: string) {
		if (pendingId) await forgetShare(pendingId);
		const contactId = person?.id;
		removals.notify(said);
		await goto(contactId ? `/contacts/${contactId}` : '/', { invalidateAll: true });
	}

	function savedLine(): string {
		switch (target) {
			case 'gallery':
				return t('share.saved.gallery', { count: photoCount });
			case 'moment':
				return t('share.saved.moment');
			case 'gift':
				return t('share.saved.gift');
			case 'todo':
				return t('share.saved.todo');
			default:
				return t('share.saved.avatar');
		}
	}

	async function save() {
		if (!person || !canSave) return;
		if (target === 'avatar') {
			cropping = photos[0]?.blob ?? null;
			return;
		}
		const chosen = draft();
		if (!chosen) return;
		const command = commandFor(
			chosen,
			{
				contactId: person.id,
				visibility,
				day: defaultDay(data.today, new Date().toLocaleDateString('en-CA'))
			},
			{ id: ulid(), issuedAt: Date.now() }
		);
		if (!command) return;
		saving = true;
		error = null;
		try {
			const kept: KeptPhoto[] = [];
			if (target === 'gallery') {
				for (const photo of photos) kept.push({ id: ulid(), ...(await processImage(photo.blob)) });
			}
			if (!reachability.reachable) {
				await outbox.add(command, kept, person.displayName);
				return await finish(t('share.keptForLater'));
			}
			const delivery = await outbox.submit(command, kept, person.displayName);
			if (delivery.status === 'refused') {
				error = delivery.reason;
				return;
			}
			await finish(delivery.status === 'kept' ? t('share.keptForLater') : savedLine());
		} catch {
			error = t('share.failed');
		} finally {
			saving = false;
		}
	}

	/** The profile photo: cropped here, then posted as the person page's uploader does. */
	async function setAvatar(crop: CropRect) {
		const picture = cropping;
		cropping = null;
		if (!picture || !person) return;
		saving = true;
		error = null;
		try {
			const { image, thumb, width, height, takenAt } = await processAvatar(picture, crop);
			const body = new FormData();
			body.append('image', image, 'avatar.jpg');
			body.append('thumb', thumb, 'thumb.jpg');
			body.append('width', String(width));
			body.append('height', String(height));
			if (takenAt) body.append('takenAt', takenAt);
			const res = await fetch(`/contacts/${person.id}?/setAvatar`, { method: 'POST', body });
			if (!res.ok) throw new Error(`setAvatar answered ${res.status}`);
			await finish(t('share.saved.avatar'));
		} catch {
			error = t('share.failed');
		} finally {
			saving = false;
		}
	}

	async function close() {
		if (pendingId) await forgetShare(pendingId);
		await goto('/');
	}
</script>

<svelte:head><title>{t('share.title')}</title></svelte:head>

<div class="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-3 pb-8" data-testid="share-sheet">
	<header class="-ml-2 flex items-center gap-2">
		<Button variant="ghost" icon="remove" label={t('share.close')} onclick={close} />
		<h1 class="text-lg font-semibold text-fg">{t('share.title')}</h1>
	</header>

	{#if !reachability.reachable}
		<p
			class="flex items-start gap-2.5 rounded-app border border-dashed border-border bg-card px-3 py-2.5 text-sm text-fg-muted"
			data-testid="share-offline"
		>
			<span class="mt-0.5 shrink-0"><Icon name="offline" size={18} /></span>
			{t('share.offline')}
		</p>
	{/if}

	{#if loaded}
		{#if gone || shared.kind === 'nothing'}
			<p
				class="rounded-app bg-card p-3 text-sm text-fg-muted shadow-card"
				data-testid="share-empty"
			>
				{gone ? t('share.gone') : t('share.nothing')}
			</p>
			{#if photosLeftBehind}<p class="text-sm text-fg-muted">{t('share.photosLeftBehind')}</p>{/if}
		{:else}
			<SharedPreview {shared} {previews} {photosLeftBehind} />

			<SharePersonPicker people={data.people} {offered} {picked} onpick={(id) => (picked = id)} />

			<ShareTargetPicker {choices} picked={target} {photoCount} onpick={(id) => (target = id)} />

			<ShareFields
				{target}
				personName={person?.displayName ?? null}
				linkAdded={shared.kind === 'words' && shared.link !== null}
				bind:momentBody
				bind:giftTitle
				bind:giftUrl
				bind:todoWords
				bind:visibility
			/>

			<FormError message={error} />

			<div class="flex flex-col gap-1.5">
				{#if !person}
					<p class="text-center text-xs text-fg-muted">{t('share.needsPerson')}</p>
				{/if}
				<Button
					variant="primary"
					class="w-full"
					disabled={!canSave}
					onclick={save}
					data-testid="share-save"
				>
					{saving
						? t('share.saving')
						: reachability.reachable
							? t('share.save')
							: t('share.saveForLater')}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<PhotoCropper file={cropping} onconfirm={setAvatar} oncancel={() => (cropping = null)} />
