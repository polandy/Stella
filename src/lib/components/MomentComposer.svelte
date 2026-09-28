<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { processImage } from '$lib/image/process-image';
	import { allowedForAudience } from '$lib/mentions/audience';
	import { activeHandle, handleFor, insertHandle, suggest, type ActiveHandle } from '$lib/mentions/picker';
	import type { MomentCapturePayload } from '$lib/commands/commands';
	import type { KeptOf, KeptPhoto } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { linkHintHref } from '$lib/stream/link-hint';
	import { tick } from 'svelte';
	import { ulid } from 'ulid';

	/*
	 * The "What happened?" field (docs/02 §2.22.1). A plain textarea that posts natively; the
	 * @-picker, inline "Create …" queue and browser-side photo processing are enhancements.
	 *
	 * With JavaScript it saves as a named command through the outbox, in reach or not
	 * (docs/concepts/offline-capture.md §4, §8 #10): in reach it waits for Stella's answer, and
	 * when there is none it keeps the moment on the device. The name is what makes that safe: a
	 * moment whose answer was lost on the way is recognised when it arrives a second time.
	 * `editing` opens a kept moment that has not been sent yet.
	 */

	interface Candidate {
		id: string;
		displayName: string;
		firstName: string | null;
		lastName: string | null;
		visibility: 'shared' | 'private';
	}
	interface Props {
		/** People the author may see; the picker narrows to the moment's audience itself. */
		candidates: Candidate[];
		me: { id: string; name: string; avatarPhotoId?: string | null };
		today: string;
		error?: string | null;
		/** Body to restore after a failed submit. */
		draft?: string | null;
		autofocus?: boolean;
		/** A moment kept on this device, open for editing before it is sent. */
		editing?: KeptOf<'moment.capture'> | null;
		/** The edit was saved or abandoned. */
		onEditDone?: () => void;
		/** A moment was kept on this device for later. */
		onKept?: () => void;
	}
	let {
		candidates,
		me,
		today,
		error = null,
		draft = null,
		autofocus = false,
		editing = null,
		onEditDone,
		onKept
	}: Props = $props();

	const t = useTranslate();

	// svelte-ignore state_referenced_locally -- the kept moment is only a starting value on purpose
	const kept = editing?.command.payload ?? null;
	// svelte-ignore state_referenced_locally -- the draft is only a starting value on purpose
	let body = $state(kept?.body ?? draft ?? '');
	let visibility = $state<'shared' | 'private'>(kept?.visibility ?? 'shared');
	let newPeople = $state<string[]>(kept ? [...kept.newPeople] : []);
	// The command this draft will be saved as; a new one after every save.
	let commandId = $state(ulid());
	// Bumped after a save to start the day and photo fields afresh. `form.reset()` cannot:
	// it empties the date field's parts instead of returning them to the default day.
	let fresh = $state(0);

	// A page kept on the device may be days old, and so is the day it was rendered with. The
	// device's own calendar is the writer's; it only ever moves the default forward.
	const localDay = () => new Date().toLocaleDateString('en-CA');
	const day = $derived(browser && localDay() > today ? localDay() : today);
	let picked = $state<File[]>([]);
	let saving = $state(false);
	let localError = $state<string | null>(null);
	let textarea: HTMLTextAreaElement | undefined = $state();

	// Picker state: the handle under the caret and the ranked suggestions for it.
	let active = $state<ActiveHandle | null>(null);
	let selected = $state(0);
	const audience = $derived(
		allowedForAudience(candidates, visibility)
	);
	const known = $derived([
		...audience,
		...newPeople.map((n) => ({ id: `new:${n}`, displayName: n, firstName: null, lastName: null }))
	]);
	const suggestions = $derived(active ? suggest(active.query, known) : { people: [], create: null });
	const rows = $derived([
		...suggestions.people.map((p) => ({ kind: 'person' as const, person: p })),
		...(suggestions.create ? [{ kind: 'create' as const, name: suggestions.create }] : [])
	]);

	// The people the text currently references, for the "goes to …'s journal" line.
	const referenced = $derived.by(() => {
		const handles = body.match(/(?<![\p{L}\p{N}@\\])@[\p{L}][\p{L}\p{N}]*/gu) ?? [];
		const byHandle = new Map(known.map((c) => [handleFor(c).toLowerCase(), c]));
		const out: { id: string; displayName: string }[] = [];
		for (const h of handles) {
			const c = byHandle.get(h.toLowerCase());
			if (c && !out.some((o) => o.id === c.id)) out.push(c);
		}
		return out;
	});
	const canSave = $derived(body.trim().length > 0 && referenced.length > 0 && !saving);

	// Leaving the field closes the picker a moment later, so a click on a suggestion still
	// lands. Coming back must cancel that: a navigation that returns focus to the page after a
	// save would otherwise close the picker under whoever is already typing the next moment.
	let closingPicker: ReturnType<typeof setTimeout> | undefined;
	function closePickerSoon() {
		closingPicker = setTimeout(() => (active = null), 120);
	}

	function refreshPicker() {
		clearTimeout(closingPicker);
		if (!textarea) return;
		active = activeHandle(body, textarea.selectionStart);
		selected = 0;
	}

	async function choose(index: number) {
		const row = rows[index];
		if (!row || !active || !textarea) return;
		let handle: string;
		if (row.kind === 'create') {
			if (!newPeople.includes(row.name)) newPeople = [...newPeople, row.name];
			handle = '@' + row.name;
		} else {
			handle = handleFor(row.person);
		}
		const r = insertHandle(body, active, textarea.selectionStart, handle);
		body = r.text;
		active = null;
		await tick();
		textarea.focus();
		textarea.setSelectionRange(r.caret, r.caret);
	}

	function onKeydown(event: KeyboardEvent) {
		if (active && rows.length > 0) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				selected = (selected + 1) % rows.length;
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				selected = (selected - 1 + rows.length) % rows.length;
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				event.preventDefault();
				void choose(selected);
				return;
			}
			if (event.key === 'Escape') {
				active = null;
				return;
			}
		}
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSave) {
			event.preventDefault();
			(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
		}
	}

	function onFiles(event: Event) {
		picked = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
	}

	/** What the form says, as the command's payload. */
	function payloadFrom(formEl: HTMLFormElement): MomentCapturePayload {
		const data = new FormData(formEl);
		return {
			body: String(data.get('body') ?? '').trim(),
			entryDate: String(data.get('entryDate') ?? day),
			visibility,
			newPeople: [...newPeople]
		};
	}

	function clear() {
		body = '';
		picked = [];
		newPeople = [];
		fresh++;
		commandId = ulid();
	}

	/**
	 * The picked photos, processed in the browser (downscaled, location stripped) and each named
	 * as a command of its own — once per save, so a save that ends up kept for later sends the
	 * very same photos under the very same names.
	 */
	async function preparePhotos(): Promise<KeptPhoto[]> {
		const photos: KeptPhoto[] = [];
		for (const file of picked) {
			const { image, thumb, width, height } = await processImage(file);
			photos.push({ id: ulid(), image, thumb, width, height });
		}
		return photos;
	}

	/** Keep the moment, and its photos, on this device until Stella answers again. */
	async function keepForLater(formEl: HTMLFormElement, photos: KeptPhoto[]) {
		try {
			await outbox.add(
				{ id: commandId, type: 'moment.capture', payload: payloadFrom(formEl), issuedAt: Date.now() },
				photos
			);
			clear();
			onKept?.();
		} catch {
			// The text stays in the field: nothing is half-saved.
			localError = t('composer.couldNotKeep');
		}
	}

	/** Save an edit into the kept moment it came from. */
	async function saveEdit(formEl: HTMLFormElement, item: KeptOf<'moment.capture'>) {
		const saved = await outbox.revise(item.command.id, payloadFrom(formEl), ulid());
		if (!saved) {
			localError = t('composer.alreadySending');
			return;
		}
		clear();
		onEditDone?.();
	}

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		saving = true;
		localError = null;
		try {
			if (editing) return await saveEdit(formEl, editing);
			const photos = await preparePhotos();
			if (!reachability.reachable) return await keepForLater(formEl, photos);

			const delivery = await outbox.submit(
				{ id: commandId, type: 'moment.capture', payload: payloadFrom(formEl), issuedAt: Date.now() },
				photos
			);
			if (delivery.status === 'refused') {
				// The text stays in the field, to be corrected and saved as a new moment.
				localError = delivery.reason;
				commandId = ulid();
				return;
			}
			clear();
			if (delivery.status === 'kept') return onKept?.();
			// Back to the stream, offering to link the first two people in it (§2.22.1).
			const { linkSuggestion } = delivery.result as { linkSuggestion: [string, string] | null };
			await goto(linkHintHref(linkSuggestion), { invalidateAll: true });
		} catch {
			localError = t('composer.saveFailed');
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		if (autofocus) textarea?.focus();
	});
</script>

<form
	method="POST"
	action="/?/capture"
	enctype="multipart/form-data"
	onsubmit={onSubmit}
	class="relative flex flex-col rounded-app bg-card shadow-card transition-shadow focus-within:ring-2 focus-within:ring-primary/40"
>
	{#if error || localError}
		<p class="mx-3 mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error ?? localError}</p>
	{/if}
	<div class="flex items-start gap-3 p-3 pb-2">
		<Avatar id={me.id} name={me.name} avatarPhotoId={me.avatarPhotoId ?? null} size={40} />
		<textarea
			bind:this={textarea}
			bind:value={body}
			name="body"
			rows="2"
			required
			data-moment-body
			placeholder={t('composer.placeholder')}
			aria-label={t('composer.label')}
			aria-autocomplete="list"
			onkeydown={onKeydown}
			oninput={refreshPicker}
			onclick={refreshPicker}
			onkeyup={(e) => (e.key.startsWith('Arrow') ? refreshPicker() : undefined)}
			onfocus={() => clearTimeout(closingPicker)}
			onblur={closePickerSoon}
			class="min-h-14 flex-1 resize-y bg-transparent font-serif text-[17px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
		></textarea>
	</div>

	{#if active && rows.length > 0}
		<ul
			role="listbox"
			class="absolute left-14 top-16 z-10 w-[min(320px,calc(100%-4rem))] rounded-app border border-border bg-card p-1 shadow-pop"
		>
			<li class="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{t('composer.people')}</li>
			{#each rows as row, i (row.kind === 'person' ? row.person.id : 'create')}
				<li>
					<button
						type="button"
						role="option"
						aria-selected={i === selected}
						onmousedown={(e) => {
							e.preventDefault();
							void choose(i);
						}}
						onmouseenter={() => (selected = i)}
						class="flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left text-sm text-fg aria-selected:bg-primary-soft"
					>
						{#if row.kind === 'person'}
							<Avatar id={row.person.id} name={row.person.displayName} size={22} />
							<span class="truncate">{row.person.displayName}</span>
							{#if row.person.id.startsWith('new:')}<span class="ml-auto text-xs text-fg-subtle">{t('composer.justCreated')}</span>{/if}
						{:else}
							<span class="grid size-[22px] place-items-center rounded-full border border-dashed border-success text-success">+</span>
							<span class="font-semibold text-success">{t('composer.create', { name: row.name })}</span>
							<span class="ml-auto text-xs text-fg-subtle">{t('composer.newPerson')}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#each newPeople as name (name)}
		<input type="hidden" name="newPeople" value={name} />
	{/each}

	<div class="flex flex-wrap items-center gap-2 border-t border-border-subtle px-3 py-2">
		<label class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted has-checked:border-transparent has-checked:bg-primary-soft has-checked:font-semibold has-checked:text-primary">
			<input type="checkbox" class="sr-only" checked={visibility === 'shared'} onchange={(e) => (visibility = (e.currentTarget as HTMLInputElement).checked ? 'shared' : 'private')} />
			<Icon name={visibility === 'shared' ? 'shared' : 'private'} size={13} />
			{visibility === 'shared' ? t('common.shared') : t('common.private')}
		</label>
		<input type="hidden" name="visibility" value={visibility} />
		{#key fresh}
		{#if !editing}
			<label class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted hover:text-fg">
				<Icon name="photo" size={13} />
				{picked.length ? t('composer.photoCount', { count: picked.length }) : t('composer.photo')}
				<input type="file" accept="image/*" multiple onchange={onFiles} class="hidden" />
			</label>
		{/if}
		<DateField name="entryDate" value={kept?.entryDate ?? day} max={day} required label={t('composer.day')} />
		{/key}
		<span class="text-xs text-fg-subtle" aria-live="polite">
			{#if referenced.length}
				{t('composer.goesTo')}
				<b class="font-semibold text-fg-muted">{referenced[0].displayName}</b>{t(
					'composer.goesToJournal'
				)}{referenced.length > 1
					? t('composer.alsoMentions', { count: referenced.length - 1 })
					: ''}
			{:else if body.trim()}
				{t('composer.needMention')}
			{/if}
		</span>
		<div class="ml-auto flex items-center gap-2">
		{#if editing}
			<Button variant="ghost" type="button" onclick={() => onEditDone?.()}>{t('common.cancel')}</Button>
		{/if}
		<Button variant="primary" disabled={!canSave}>
			{saving ? t('common.saving') : reachability.reachable ? t('common.save') : t('composer.saveForLater')}
			<kbd class="rounded border border-primary-fg/40 px-1 text-[10px] font-medium opacity-75">⌘⏎</kbd>
		</Button>
		</div>
	</div>
</form>
