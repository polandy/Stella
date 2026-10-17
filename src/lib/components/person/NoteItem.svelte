<script lang="ts">
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import MentionTextarea from '$lib/components/stream/MentionTextarea.svelte';
	import PrivateMark from '$lib/components/ui/PrivateMark.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import Swap from '$lib/components/ui/Swap.svelte';
	import Veil from '$lib/components/ui/Veil.svelte';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { createdLabel, createdOnLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { placeholderFor } from '$lib/privacy/veil';
	import { useVeil } from '$lib/privacy/veil.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { menuShift, nearMiss } from '$lib/ui/menu';
	import { INPUT } from './inputs';
	import type { PersonPageData } from './types';

	// One note on the person page (docs/02 §2.5): the text, and its editor in place.
	let {
		note,
		contactId,
		candidates,
		editing,
		onEdit,
		onDone
	}: {
		note: PersonPageData['notes'][number];
		contactId: string;
		/** Whom the note can @-mention: everyone visible but this person. */
		candidates: PersonPageData['people'];
		editing: boolean;
		/** The editor was asked for. */
		onEdit: () => void;
		/** The editor is finished, saved or not. */
		onDone: () => void;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const veil = useVeil();
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	// A private note's title and text stay blurred until asked for (docs/02 §2.10.1); while
	// they are, the title moves under the veil with the text instead of sitting in the line.
	const isPrivate = $derived(note.visibility === 'private');
	const veilId = $derived(`note:${note.id}`);
	const shownTitle = $derived(isPrivate && veil.isVeiled(veilId) ? null : note.title);

	let title = $state('');
	let body = $state('');
	let saving = $state(false);
	// A typed @Thomas that could be several people keeps saving off until one is picked.
	let unclear = $state(false);
	let error = $state<string | null>(null);

	// The absolute date behind the relative one, tapped open like a tooltip (docs/05 §5.5).
	// Opens above the date, over the gap between notes, rather than below where it would sit
	// on top of the note's own text; only the rare note right at the top of the screen opens
	// downward instead, when there truly is no room above it.
	let dateOpen = $state(false);
	let dateBtn = $state<HTMLButtonElement>();
	let bubble = $state<HTMLSpanElement>();
	let bubbleShift = $state(0);
	let bubbleUpward = $state(true);
	const BUBBLE_MARGIN = 12;
	const NEAR_MISS = 16;

	async function openDate() {
		if (dateOpen) {
			dateOpen = false;
			return;
		}
		dateOpen = true;
		bubbleShift = 0;
		bubbleUpward = true;
		await tick();
		if (!dateBtn || !bubble) return;
		const bounds = { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
		bubbleShift = menuShift(bubble.getBoundingClientRect(), bounds, BUBBLE_MARGIN);
		const btnBox = dateBtn.getBoundingClientRect();
		const above = btnBox.top - (bounds.top + BUBBLE_MARGIN);
		const below = bounds.bottom - BUBBLE_MARGIN - btnBox.bottom;
		bubbleUpward = above >= bubble.offsetHeight || above >= below;
	}

	function closeDate(returnFocus = true) {
		dateOpen = false;
		if (returnFocus) dateBtn?.focus();
	}

	function onDateKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !dateOpen) return;
		event.preventDefault();
		closeDate();
	}

	function onWindowPointerdown(event: PointerEvent) {
		if (!dateOpen || !dateBtn || !bubble) return;
		const target = event.target as Node;
		if (dateBtn.contains(target) || bubble.contains(target)) return;
		const tap = { x: event.clientX, y: event.clientY };
		if (nearMiss(bubble.getBoundingClientRect(), tap, NEAR_MISS)) return;
		closeDate(false);
	}

	function toggle() {
		if (editing) return onDone();
		title = note.title ?? '';
		body = note.bodyForEdit ?? '';
		error = null;
		if (isPrivate) veil.revealForEdit(veilId);
		onEdit();
	}

	// Online only, like removing: the right to edit is checked when the edit lands.
	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = null;
		try {
			const res = await fetch(`/contacts/${contactId}?/editNote`, {
				method: 'POST',
				body: new FormData(event.currentTarget as HTMLFormElement),
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text());
			// A refusal says why — a namesake to pick, say (docs/02 §2.2.3) — and keeps the text.
			if (result.type === 'failure') {
				error = (result.data?.noteError as string | undefined) ?? t('contact.notes.saveFailed');
				return;
			}
			if (result.type === 'error') throw new Error();
			removals.notify(t('components.saved'));
			onDone();
			await invalidateAll();
		} catch {
			error = t('contact.notes.saveFailed');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:window onpointerdown={onWindowPointerdown} />

<li class="rounded-control bg-bg-sunken p-3">
	<div class="mb-1 flex items-center gap-2">
		{#if note.isPinned}
			<span class="inline-flex items-center gap-1 text-xs font-medium text-primary">
				<Icon name="pinned" size={12} />{t('contact.notes.pinned')}
			</span>
		{/if}
		{#if shownTitle}<span class="font-medium text-fg">{shownTitle}</span>{/if}
		{#if note.author}
			<span class="text-xs text-fg-subtle">{shownTitle ? `· ${note.author}` : note.author}</span>
		{/if}
		<span class="relative text-xs text-fg-subtle">
			{shownTitle || note.author ? '· ' : ''}<button
				bind:this={dateBtn}
				type="button"
				aria-expanded={dateOpen}
				aria-label={t('contact.notes.createdOn', {
					day: createdOnLabel(i18n, note.createdAt, timeZone)
				})}
				onclick={openDate}
				onkeydown={onDateKeydown}
				class="underline decoration-fg-subtle underline-offset-2 hover:text-primary hover:decoration-primary"
				>{createdLabel(i18n, note.createdAt, Date.now(), timeZone)}</button
			>
			{#if dateOpen}
				<!-- border-fg-subtle, not border-border: on bg-sunken, border nearly vanishes in
				     dark theme (same fix as LinkedNames' underline). -->
				<span
					bind:this={bubble}
					role="status"
					class="absolute left-0 z-30 rounded-control border border-fg-subtle bg-card px-2 py-1 text-xs whitespace-nowrap text-fg shadow-pop"
					class:top-full={!bubbleUpward}
					class:mt-1={!bubbleUpward}
					class:bottom-full={bubbleUpward}
					class:mb-1={bubbleUpward}
					style:translate={bubbleShift ? `${bubbleShift}px 0` : undefined}
					>{createdOnLabel(i18n, note.createdAt, timeZone)}</span
				>
			{/if}
		</span>
		<span class="ml-auto inline-flex items-center gap-2">
			{#if isPrivate}<PrivateMark {veilId} class="text-xs" />{/if}
			<!-- Its author's alone (docs/03 §3.7). Online only. -->
			{#if note.editable}
				<Button
					variant="ghost"
					size="sm"
					type="button"
					icon="write"
					label={t('contact.notes.edit')}
					title={t('contact.notes.edit')}
					aria-expanded={editing}
					onclick={toggle}
				/>
			{/if}
			<!-- Its author's, or an admin's on a shared one (docs/03 §3.7). Online only. -->
			{#if note.removable}
				<RemoveButton
					kind="note"
					id={note.id}
					action="?/removeNote"
					fields={{ id: note.id }}
					label={t('contact.notes.remove')}
					removed={t('contact.notes.removed')}
				/>
			{/if}
		</span>
	</div>
	<!-- The note and its editor glide into each other in place (docs/05 §5.11). -->
	<Swap when={editing}>
		<form method="POST" action="?/editNote" onsubmit={save} class="flex flex-col gap-3">
			<input type="hidden" name="id" value={note.id} />
			<FormError message={error} />
			<label class="flex flex-col gap-1 text-sm">
				<span class="text-fg-muted">{t('contact.notes.titleOptional')}</span>
				<input name="title" bind:value={title} class="{INPUT} w-full" />
			</label>
			<MentionTextarea
				name="body"
				label={t('contact.notes.label')}
				required
				bind:value={body}
				bind:unclear
				names={note.mentionNames}
				{candidates}
				visibility={note.visibility}
				class="{INPUT} w-full"
			/>
			<div class="flex flex-wrap items-center gap-3">
				<Button variant="primary" size="sm" disabled={saving || unclear}>
					{saving ? t('common.saving') : t('common.save')}
				</Button>
				<Button variant="ghost" size="sm" type="button" onclick={onDone}>
					{t('common.cancel')}
				</Button>
			</div>
		</form>
		{#snippet otherwise()}
			<Veil id={veilId} {isPrivate} label={t('privacy.veil.note')}>
				{#snippet standIn()}
					{#if note.title}<p class="font-medium text-fg">{placeholderFor(note.title)}</p>{/if}
					<p class="whitespace-pre-line text-fg">{placeholderFor(note.bodyHtml)}</p>
				{/snippet}
				<!-- server-rendered, already-safe Markdown (docs/02 §2.5) -->
				<div class="note-body text-fg">{@html note.bodyHtml}</div>
			</Veil>
		{/snippet}
	</Swap>
</li>
