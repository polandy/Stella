<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PhotoCropper from '$lib/components/ui/PhotoCropper.svelte';
	import {
		cutCandidates,
		type CandidatePerson,
		type CutCandidate
	} from '$lib/circles/cut-candidates';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { CropRect } from '$lib/media/crop';
	import { loadFullPicture, sendCut } from '$lib/media/send-cut';
	import { mediaUrl } from '$lib/media/urls';

	/*
	 * Cutting profile pictures out of a group photo, one person after another
	 * (docs/02 §2.4.2). The lightbox's *Use as profile picture for …* opens a
	 * person picker — the circle's members first, those in the photo's role ahead, a search over
	 * everyone else — and a pick opens the cropper on the full picture, loaded once for the
	 * sitting. After a cut the dialog says so and offers the next person; people already wearing
	 * a cut of this photo are marked. A cut is sent now or not at all: it is never queued.
	 */

	interface Props {
		photoId: string;
		photoRole: string | null;
		members: readonly { contactId: string; role: string | null }[];
		people: readonly CandidatePerson[];
		/** Who wears a cut of this photo, with the square, so choosing again starts there. */
		wearers: readonly { contactId: string; crop: CropRect | null }[];
	}
	let { photoId, photoRole, members, people, wearers }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;

	let dialog: HTMLDialogElement | undefined = $state();
	let query = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	/** The person whose square is being chosen; the cropper is open while the picture is set. */
	let chosen = $state<CutCandidate | null>(null);
	let picture = $state<{ photoId: string; blob: Blob } | null>(null);
	let cropping = $state(false);
	/** Who was just given their picture: the dialog then offers the next person. */
	let done = $state<string | null>(null);

	const groups = $derived(
		cutCandidates({
			members,
			people: [...people],
			photoRole,
			wearing: wearers.map((w) => w.contactId),
			query
		})
	);
	const listed = $derived(groups.inRole.length + groups.inCircle.length + groups.others.length);

	function open() {
		query = '';
		error = null;
		done = null;
		dialog?.showModal();
	}

	async function pick(person: CutCandidate) {
		if (busy) return;
		error = null;
		chosen = person;
		busy = true;
		try {
			// The full picture, loaded once however many people are cut from it in one sitting.
			if (picture?.photoId !== photoId)
				picture = { photoId, blob: await loadFullPicture(mediaUrl(photoId)) };
			cropping = true;
		} catch {
			error = t('components.photo.failed');
		} finally {
			busy = false;
		}
	}

	async function cut(crop: CropRect) {
		cropping = false;
		const person = chosen;
		if (!person || !picture) return;
		busy = true;
		try {
			await sendCut('?/cutProfilePicture', { photoId, contactId: person.id }, picture.blob, crop);
			await invalidateAll();
			done = person.displayName;
			query = '';
		} catch {
			error = t('circles.cut.failed');
		} finally {
			busy = false;
		}
	}

	const initialCrop = $derived(
		chosen ? (wearers.find((w) => w.contactId === chosen!.id)?.crop ?? null) : null
	);
	const INPUT = 'w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg';
</script>

{#snippet personRow(person: CutCandidate)}
	<li>
		<button
			type="button"
			onclick={() => pick(person)}
			disabled={busy}
			class="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left text-sm hover:bg-bg-sunken focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
			data-testid="cut-candidate"
		>
			<Avatar
				id={person.id}
				name={person.displayName}
				avatarPhotoId={person.avatarPhotoId}
				size={36}
			/>
			<span class="min-w-0 flex-1 truncate">{person.displayName}</span>
			{#if person.wearsCut}
				<span
					class="inline-flex shrink-0 items-center gap-1 text-xs text-primary"
					title={t('circles.cut.wears')}
				>
					<Icon name="done" size={14} /><span class="sr-only">{t('circles.cut.wears')}</span>
				</span>
			{/if}
		</button>
	</li>
{/snippet}

<Button variant="secondary" size="sm" icon="self" onclick={open} data-testid="cut-open"
	>{t('circles.cut.use')}</Button
>

<dialog
	bind:this={dialog}
	aria-label={t('circles.cut.dialog')}
	onclick={(event) => event.target === event.currentTarget && dialog?.close()}
	class="m-auto w-full max-w-md rounded-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm"
	data-testid="cut-dialog"
>
	<div class="flex max-h-[85vh] flex-col gap-3 p-4">
		<div class="flex items-center justify-between gap-3">
			<h2 class="text-base font-semibold">{t('circles.cut.dialog')}</h2>
			<Button variant="ghost" size="sm" onclick={() => dialog?.close()}>{t('common.close')}</Button>
		</div>

		{#if done}
			<p class="flex items-center gap-2 text-sm text-fg" role="status" data-testid="cut-done">
				<Icon name="done" size={16} />{t('circles.cut.done', { name: done })}
			</p>
			<div class="flex flex-wrap gap-2">
				<Button variant="primary" size="sm" onclick={() => (done = null)}
					>{t('circles.cut.next')}</Button
				>
				<Button variant="ghost" size="sm" onclick={() => dialog?.close()}
					>{t('circles.cut.finish')}</Button
				>
			</div>
		{:else}
			<p class="text-sm text-fg-muted">{t('circles.cut.whom')}</p>
			<input
				type="search"
				bind:value={query}
				placeholder={t('circles.cut.search')}
				aria-label={t('circles.cut.search')}
				class={INPUT}
			/>
			<FormError message={error} />
			{#if busy}<p class="text-xs text-fg-subtle" role="status">{t('circles.cut.loading')}</p>{/if}
			<div class="-mx-2 flex-1 overflow-y-auto">
				{#if groups.inRole.length > 0}
					<h3 class="px-2 pt-1 text-xs font-medium tracking-wide text-fg-subtle uppercase">
						{photoRole}
					</h3>
					<ul>
						{#each groups.inRole as person (person.id)}{@render personRow(person)}{/each}
					</ul>
				{/if}
				{#if groups.inCircle.length > 0}
					<h3 class="px-2 pt-2 text-xs font-medium tracking-wide text-fg-subtle uppercase">
						{groups.inRole.length > 0 ? t('circles.cut.restOfCircle') : t('circles.cut.inCircle')}
					</h3>
					<ul>
						{#each groups.inCircle as person (person.id)}{@render personRow(person)}{/each}
					</ul>
				{/if}
				{#if groups.others.length > 0}
					<h3 class="px-2 pt-2 text-xs font-medium tracking-wide text-fg-subtle uppercase">
						{t('circles.cut.everyone')}
					</h3>
					<ul>
						{#each groups.others as person (person.id)}{@render personRow(person)}{/each}
					</ul>
				{/if}
				{#if listed === 0}
					<p class="px-2 text-sm text-fg-subtle">
						{query.trim() ? t('circles.cut.nobody') : t('circles.cut.searchHint')}
					</p>
				{:else if query.trim() === ''}
					<p class="px-2 pt-2 text-xs text-fg-subtle">{t('circles.cut.searchHint')}</p>
				{/if}
			</div>
		{/if}
	</div>
</dialog>

<PhotoCropper
	file={cropping ? (picture?.blob ?? null) : null}
	initial={initialCrop}
	onconfirm={cut}
	oncancel={() => (cropping = false)}
/>
