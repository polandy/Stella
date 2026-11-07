<script lang="ts">
	import { FIELD } from '$lib/components/ui/field';
	import { reveal } from '$lib/motion/motion.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import ImmichLibraryPicker from '$lib/components/immich/ImmichLibraryPicker.svelte';
	import PhotoSourceMenu from '$lib/components/immich/PhotoSourceMenu.svelte';
	import MentionTextarea from '$lib/components/stream/MentionTextarea.svelte';
	import { processImage } from '$lib/media/process-image';
	import { keepable } from '$lib/pwa/keepable';
	import type { KeptPhoto } from '$lib/pwa/outbox';
	import { ulid } from 'ulid';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { ComponentProps } from 'svelte';

	/*
	 * Writing a new journal entry (docs/02 §2.20). Mounted for the page's whole visit and shown
	 * while `open`, so the photos picked and the audience chosen outlive closing the form.
	 */
	let {
		open,
		contact,
		candidates,
		tags,
		today,
		immichLibrary,
		error,
		onDone
	}: {
		open: boolean;
		/** Whose journal the entry goes into. */
		contact: { id: string; displayName: string };
		/** Whom the @-picker offers: everyone visible but the person whose journal it is. */
		candidates: ComponentProps<typeof MentionTextarea>['candidates'];
		tags: ComponentProps<typeof MentionTextarea>['tags'];
		today: string;
		/** A photo can come from Immich beside an upload (docs/02 §2.24.9). */
		immichLibrary: boolean;
		/** The save action's refusal, when the form posted without JavaScript or was refused. */
		error: string | null | undefined;
		/** The entry was saved or kept; the page closes the form. */
		onDone: () => void;
	} = $props();

	const t = useI18n().t;

	// The entry's audience narrows whom the @-picker offers (docs/02 §2.20.1).
	let entryVisibility = $state<'shared' | 'private'>('shared');
	// A typed @Thomas that could be several people keeps saving off until one is picked.
	let entryUnclear = $state(false);

	// Selected images for the entry being composed (processed in the browser on submit).
	let picked = $state<File[]>([]);
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let composeForm: HTMLFormElement | undefined = $state();

	function onFiles(event: Event) {
		picked = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
	}

	/*
	 * Photos copied from Immich (docs/02 §2.24.9) add to the entry's, and a new pick on the device
	 * keeps them. The picker opens on the day the entry's field says.
	 */
	let fromImmich = $state<File[]>([]);
	let libraryOpen = $state(false);
	let libraryDay = $state('');
	function openLibrary() {
		const entryDate = composeForm ? new FormData(composeForm).get('entryDate') : null;
		libraryDay = typeof entryDate === 'string' && entryDate !== '' ? entryDate : today;
		libraryOpen = true;
	}

	/*
	 * An entry is saved as a command through the outbox, in reach or not (docs/02 §2.18.1, docs/04
	 * ADR-076): its photos are processed first (downscaled, location
	 * stripped) and follow it. Kept on the device when Stella cannot take it, it shows above the
	 * timeline until it is sent. Without JavaScript the form posts to its action as before.
	 */
	function doneComposing() {
		composeForm?.reset();
		picked = [];
		fromImmich = [];
		entryVisibility = 'shared';
		onDone();
	}
	const journalForm = $derived(
		keepable(
			{
				toCommand: (form, id) => {
					const body = String(form.get('body') ?? '').trim();
					const entryDate = String(form.get('entryDate') ?? '');
					if (!body || !entryDate) return null;
					return {
						id,
						type: 'journal.write',
						payload: {
							contactId: contact.id,
							entryDate,
							title: String(form.get('title') ?? '').trim() || null,
							body,
							visibility: form.get('visibility') === 'private' ? 'private' : 'shared'
						},
						issuedAt: Date.now()
					};
				},
				about: contact.displayName,
				errorKey: 'journalError',
				photos: async () => {
					uploading = true;
					uploadError = null;
					try {
						const photos: KeptPhoto[] = [];
						for (const file of [...picked, ...fromImmich])
							photos.push({ id: ulid(), ...(await processImage(file)) });
						return photos;
					} catch {
						uploadError = t('journal.uploadFailed');
						return null;
					} finally {
						uploading = false;
					}
				},
				onApplied: doneComposing,
				onKept: doneComposing
			},
			() => {}
		)
	);
</script>

{#if open}
	<form
		transition:reveal
		method="POST"
		action="?/save"
		enctype="multipart/form-data"
		use:enhance={journalForm}
		bind:this={composeForm}
		class="flex flex-col gap-3 rounded-app bg-card p-5 shadow-card"
	>
		<FormError message={error} />
		<FormError message={uploadError} />
		<div class="flex flex-wrap items-end gap-3">
			<div class="flex flex-col gap-1 text-sm">
				<span class="text-fg-muted">{t('journal.day')}</span>
				<DateField name="entryDate" value={today} max={today} required label={t('journal.day')} />
			</div>
			<label class="flex flex-1 flex-col gap-1 text-sm">
				<span class="text-fg-muted">{t('journal.titleOptional')}</span>
				<input name="title" placeholder={t('journal.titlePlaceholder')} class="{FIELD} px-3 py-2" />
			</label>
		</div>
		<MentionTextarea
			name="body"
			label={t('journal.entry')}
			rows={5}
			required
			{candidates}
			{tags}
			visibility={entryVisibility}
			bind:unclear={entryUnclear}
			placeholder={t('journal.bodyPlaceholder')}
			class="{FIELD} w-full px-3 py-2"
		/>
		<div class="flex flex-wrap items-center gap-3">
			{#if immichLibrary}
				<PhotoSourceMenu
					label={t('journal.addPhotos')}
					look="outline"
					onfiles={(files) => (picked = files)}
					onimmich={openLibrary}
				>
					{#snippet trigger()}<Icon name="photo" size={15} />{t('journal.addPhotos')}{/snippet}
				</PhotoSourceMenu>
			{:else}
				<!-- `sr-only`, not `hidden`: a hidden input is out of the tab order, and the button
				     with it (WCAG 2.1.1). The label shows where focus is instead. -->
				<label
					class="inline-flex cursor-pointer items-center gap-2 rounded-app border border-border px-3 py-2 text-sm text-fg-muted hover:text-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring"
				>
					<Icon name="photo" size={15} />
					{t('journal.addPhotos')}
					<input type="file" accept="image/*" multiple onchange={onFiles} class="sr-only" />
				</label>
			{/if}
			{#if picked.length + fromImmich.length}
				<span class="text-sm text-fg-subtle">
					{t('journal.photosReady', { count: picked.length + fromImmich.length })}
				</span>
			{/if}
		</div>
		<div class="flex flex-wrap items-center gap-4 text-sm">
			<fieldset class="flex flex-wrap items-center gap-4">
				<legend class="sr-only">{t('common.visibility')}</legend>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="shared" bind:group={entryVisibility} />
					{t('common.shared')}
				</label>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="private" bind:group={entryVisibility} />
					{t('journal.privateOnlyYou')}
				</label>
			</fieldset>
			<Button variant="primary" disabled={uploading || entryUnclear} class="ml-auto">
				{uploading ? t('common.saving') : t('journal.saveEntry')}
			</Button>
		</div>
		<p class="text-xs text-fg-subtle">
			{t('journal.oneEntryPerDay')}
		</p>
	</form>
{/if}

{#if immichLibrary}
	<ImmichLibraryPicker
		bind:open={libraryOpen}
		day={libraryDay}
		onadd={(copies) => (fromImmich = [...fromImmich, ...copies.map((copy) => copy.file)])}
	/>
{/if}
