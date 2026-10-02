<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { CandidatePerson } from '$lib/circles/cut-candidates';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { CropRect } from '$lib/image/crop';
	import CutForPerson from './CutForPerson.svelte';
	import { viewUrl } from '$lib/media/urls';
	import type { CirclePagePhoto } from './types';

	let {
		photo,
		at,
		count,
		circleName,
		viewerId,
		members,
		people,
		cuts,
		error,
		photoDate,
		onclose,
		onkeydown,
		onstep
	}: {
		/** The photo being looked at. */
		photo: CirclePagePhoto;
		/** Where it is in the photos being walked, from 0. */
		at: number;
		count: number;
		circleName: string;
		viewerId: string;
		/** The circle's members, offered first when a profile picture is cut from the photo. */
		members: readonly { contactId: string; role: string | null }[];
		/** Everyone the viewer can see, for the picker's search. */
		people: readonly CandidatePerson[];
		/** Who wears a cut of this photo: how many in all, and the ones the viewer sees. */
		cuts: { people: number; wearers: { contactId: string; crop: CropRect | null }[] } | undefined;
		/** The last save's refusal, shown where it was made. */
		error: string | null;
		/** When a photo was added, in the viewer's language. */
		photoDate: (createdAt: number) => string;
		onclose: () => void;
		/** The arrow keys walk the photos. */
		onkeydown: (event: KeyboardEvent) => void;
		/** A step back (-1) or forward (+1), for whoever has no arrow keys. */
		onstep: (by: -1 | 1) => void;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const mine = $derived(photo.createdBy === viewerId);
	// Removing or making private a photo people wear asks first (concept §5.4); the cuts are
	// turned into their own photos either way, so the question is about knowing, not losing.
	const wornBy = $derived(cuts?.people ?? 0);
	let confirming = $state<'remove' | 'private' | null>(null);
	$effect(() => {
		// Another photo walked to is another question.
		void photo.id;
		confirming = null;
	});
	const INPUT = 'rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg';
	// Saves stay in the lightbox: the page's data reloads around it, the photo stays open.
	const keepOpen = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) =>
		update({ reset: false });
</script>

<!--
	The lightbox of a circle photo (docs/02 §2.4.2, concept §3.1). Anyone who sees the photo may
	caption it, give it a role and pin it; shared/private and Remove are for whoever added it, set
	apart below. Escape closes, the arrow keys and the two step buttons walk only the photos it was
	opened among. A modal <dialog>, so focus stays inside and returns on the way out (docs/05 §5.9).
-->
<dialog
	{@attach (lightbox: HTMLDialogElement) => lightbox.showModal()}
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
	onclick={(event) => event.target === event.currentTarget && onclose()}
	{onkeydown}
	aria-label={t('contact.photos.dialog')}
	class="m-auto w-full max-w-3xl rounded-app bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/90 backdrop:backdrop-blur-sm"
	data-testid="circle-photo-lightbox"
>
	<div class="flex flex-col gap-3 p-4">
		<div class="flex items-center justify-between gap-3">
			<p class="truncate text-sm text-fg-muted">
				{#if photo.roleLabel}<span class="font-medium text-fg">{photo.roleLabel}</span> · {/if}{t('circles.photos.position', { at: at + 1, count })}
			</p>
			<div class="flex items-center gap-1">
				{#if count > 1}
					<Button variant="ghost" size="sm" icon="back" label={t('circles.photos.previous')} onclick={() => onstep(-1)} />
					<Button variant="ghost" size="sm" icon="forward" label={t('circles.photos.next')} onclick={() => onstep(1)} />
				{/if}
				<Button variant="ghost" size="sm" onclick={onclose}>{t('common.close')}</Button>
			</div>
		</div>

		<img
			src={viewUrl(photo.id)}
			alt={photo.caption ?? t('circles.photos.of', { name: circleName })}
			class="max-h-[60vh] w-full rounded-control bg-bg-sunken object-contain"
		/>

		<p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
			<span>{t('circles.photos.addedBy', { date: photoDate(photo.createdAt), name: photo.createdByName })}</span>
			{#if photo.pinnedAt !== null}
				<span class="inline-flex items-center gap-1 font-medium text-primary">
					<Icon name="pinned" size={11} />{t('contact.photos.favourite')}
				</span>
			{/if}
			{#if photo.visibility === 'private'}
				<span class="inline-flex items-center gap-1"><Icon name="private" size={11} />{t('common.privateInline')}</span>
			{/if}
		</p>

		<FormError message={error} />

		<form method="POST" action="?/captionPhoto" use:enhance={keepOpen} class="flex items-center gap-2">
			<input type="hidden" name="photoId" value={photo.id} />
			<input
				name="caption"
				value={photo.caption ?? ''}
				placeholder={t('contact.photos.captionPlaceholder')}
				aria-label={t('contact.photos.caption')}
				class="min-w-0 flex-1 {INPUT}"
			/>
			<Button variant="secondary" size="sm">{t('common.save')}</Button>
		</form>

		<div class="flex flex-wrap items-center gap-2">
			<form method="POST" action="?/setPhotoRole" use:enhance={keepOpen} class="flex items-center gap-2">
				<input type="hidden" name="photoId" value={photo.id} />
				<label for="circle-photo-role" class="text-sm text-fg-muted">{t('circles.photos.role')}</label>
				<select id="circle-photo-role" name="role" value={photo.roleLabel ?? ''} class={INPUT}>
					<option value="">{t('circles.noRole')}</option>
					{#each photo.roleOptions as role (role)}<option value={role}>{role}</option>{/each}
				</select>
				<Button variant="secondary" size="sm">{t('circles.photos.saveRole')}</Button>
			</form>

			<form method="POST" action="?/pinPhoto" use:enhance={keepOpen} class="contents">
				<input type="hidden" name="photoId" value={photo.id} />
				<input type="hidden" name="pinned" value={photo.pinnedAt === null ? 'true' : 'false'} />
				<Button variant="ghost" size="sm" icon="pinned" data-testid="circle-photo-pin">
					{photo.pinnedAt === null ? t('contact.photos.pin') : t('contact.photos.unpin')}
				</Button>
			</form>

			<!-- Anyone who sees the photo may cut a profile picture out of it (concept §5.1). -->
			<CutForPerson
				photoId={photo.id}
				photoRole={photo.roleLabel}
				{members}
				{people}
				wearers={cuts?.wearers ?? []}
			/>
		</div>

		{#if mine}
			<div class="flex flex-col gap-2 border-t border-dashed border-border pt-3" data-testid="circle-photo-owner">
				<span class="text-xs text-fg-subtle">{t('circles.photos.ownerOnly')}</span>
				{#if confirming}
					<!-- The question before a photo people wear goes away or turns private (§5.4). -->
					<div class="flex flex-col gap-2 rounded-control border border-border bg-bg-sunken p-3 text-sm" role="alert" data-testid="cut-warning">
						<p class="font-medium text-fg">{t('circles.cut.wornBy', { count: wornBy })}</p>
						<p class="text-fg-muted">{confirming === 'remove' ? t('circles.cut.removeKeeps') : t('circles.cut.privateKeeps')}</p>
						<div class="flex flex-wrap items-center gap-2">
							{#if confirming === 'remove'}
								<form method="POST" action="?/removePhoto" use:enhance={keepOpen} class="contents">
									<input type="hidden" name="photoId" value={photo.id} />
									<Button variant="danger" size="sm">{t('circles.cut.removeAnyway')}</Button>
								</form>
							{:else}
								<form method="POST" action="?/setPhotoVisibility" use:enhance={keepOpen} class="contents">
									<input type="hidden" name="photoId" value={photo.id} />
									<input type="hidden" name="visibility" value="private" />
									<Button variant="secondary" size="sm" icon="private">{t('circles.cut.privateAnyway')}</Button>
								</form>
							{/if}
							<Button variant="ghost" size="sm" type="button" onclick={() => (confirming = null)}>{t('common.cancel')}</Button>
						</div>
					</div>
				{:else}
					<div class="flex flex-wrap items-center gap-2">
						{#if photo.visibility === 'shared' && wornBy > 0}
							<Button variant="ghost" size="sm" icon="private" type="button" onclick={() => (confirming = 'private')}>
								{t('contact.photos.makePrivate')}
							</Button>
						{:else}
							<form method="POST" action="?/setPhotoVisibility" use:enhance={keepOpen} class="contents">
								<input type="hidden" name="photoId" value={photo.id} />
								<input type="hidden" name="visibility" value={photo.visibility === 'private' ? 'shared' : 'private'} />
								<Button variant="ghost" size="sm" icon={photo.visibility === 'private' ? 'shared' : 'private'}>
									{photo.visibility === 'private' ? t('contact.photos.share') : t('contact.photos.makePrivate')}
								</Button>
							</form>
						{/if}
						{#if wornBy > 0}
							<Button variant="danger" size="sm" type="button" class="ml-auto" onclick={() => (confirming = 'remove')}>
								{t('common.remove')}
							</Button>
						{:else}
							<form method="POST" action="?/removePhoto" use:enhance={keepOpen} class="ml-auto">
								<input type="hidden" name="photoId" value={photo.id} />
								<Button variant="danger" size="sm">{t('common.remove')}</Button>
							</form>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</dialog>
