<script lang="ts">
	import MentionListbox from '$lib/components/stream/MentionListbox.svelte';
	import TagListbox from '$lib/components/journal/TagListbox.svelte';
	import TagsLine from '$lib/components/journal/TagsLine.svelte';
	import type { KnownTag } from '$lib/hashtags/picker';
	import { TagPicker } from '$lib/hashtags/tag-picker.svelte';
	import WhichNamesake from '$lib/components/people/WhichNamesake.svelte';
	import { allowedForAudience } from '$lib/mentions/audience';
	import {
		activeHandle,
		handleFor,
		insertHandle,
		suggest,
		type ActiveHandle
	} from '$lib/mentions/picker';
	import { shiftPicks, toEditable, toStored, type MentionPick } from '$lib/mentions/picks';
	import { unclearHandles } from '$lib/mentions/unclear';
	import { usePeopleContext } from '$lib/people/context.svelte';
	import { tellApart } from '$lib/people/namesakes';
	import { onMount, tick } from 'svelte';
	import { BLUR_CLOSE_MS } from '$lib/components/ui/blur-close';

	/*
	 * A textarea that offers people while you type `@` (docs/02 §2.20.1). The picker is an
	 * enhancement over a plain field: the form posts the text either way, and the server resolves
	 * whatever handles it finds. Unlike the moment composer it cannot create a person on the fly —
	 * a note or a journal entry is written about people who already exist.
	 *
	 * `value` is the text as stored: a person picked in the list is written as their id token, so
	 * two people called Thomas stay two people (docs/02 §2.2.3). The field itself shows the
	 * readable `@Thomas` and remembers the pick against it (`picks.ts`); posting the form sends
	 * the stored form, and without JavaScript the typed text goes and the server asks about any
	 * handle that could be more than one person.
	 *
	 * Given `tags`, the field offers the household's tags while you type `#` as well, and says
	 * under it what the text will be filed under (docs/02 §2.20.2) — a journal entry has tags, a
	 * note does not.
	 */

	interface Candidate {
		id: string;
		displayName: string;
		firstName: string | null;
		lastName: string | null;
		visibility: 'shared' | 'private';
		/** What tells namesakes apart in the list (docs/02 §2.2.3). */
		description?: string | null;
		metPlace?: string | null;
		metDate?: string | null;
		avatarPhotoId: string | null;
	}
	interface Props {
		/** Everyone the author may see; the picker narrows to the audience below. */
		candidates: Candidate[];
		/** Audience of the text being written: a shared one may only name shared people. */
		visibility?: 'shared' | 'private';
		name: string;
		/** The text as stored, with picked people as id tokens. */
		value?: string;
		/** Names for people a stored text mentions who are not offered in the list, by id. */
		names?: Record<string, string>;
		rows?: number;
		required?: boolean;
		placeholder?: string;
		label: string;
		class?: string;
		/** Set while a typed handle could be several people; the form keeps saving off meanwhile. */
		unclear?: boolean;
		/** The tags the viewer can see, for the `#` list; without them `#` is only text. */
		tags?: readonly KnownTag[];
	}
	let {
		candidates,
		visibility = 'shared',
		name,
		value = $bindable(''),
		names = {},
		rows = 3,
		required = false,
		placeholder,
		label,
		class: className = '',
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- written for the parent's bind:unclear
		unclear = $bindable(false),
		tags
	}: Props = $props();

	const uid = $props.id();
	const listboxId = `${uid}-people`;
	const optionId = (i: number) => `${uid}-person-${i}`;
	const tagListId = `${uid}-tags`;
	const tagOptionId = (i: number) => `${uid}-tag-${i}`;
	const tagPicker = new TagPicker(() => tags ?? []);

	let textarea: HTMLTextAreaElement | undefined = $state();
	let active = $state<ActiveHandle | null>(null);
	let selected = $state(0);

	function handleOf(id: string): string | null {
		const person = candidates.find((c) => c.id === id);
		if (person) return handleFor(person);
		return names[id] ? handleFor({ id, displayName: names[id] }) : null;
	}

	// What the field shows, and whom each picked handle in it stands for. Worked out here as
	// well as in the effect below, so a server-rendered field already shows its text.
	// svelte-ignore state_referenced_locally -- the effect below follows later changes
	const initial = toEditable(value, handleOf);
	let text = $state(initial.text);
	let picks: MentionPick[] = initial.picks;
	// The stored form this field last handed out, so a `value` set from outside is told apart.
	// svelte-ignore state_referenced_locally -- see above
	let handedOut: string | null = value;

	$effect.pre(() => {
		if (value === handedOut) return;
		const editable = toEditable(value, handleOf);
		text = editable.text;
		picks = editable.picks;
		handedOut = value;
	});

	/** Take the field's new text, carrying the picks across the change. */
	function changeText(next: string, picked?: MentionPick) {
		picks = shiftPicks(text, next, picks);
		if (picked) picks = [...picks, picked];
		text = next;
		handedOut = toStored(text, picks);
		value = handedOut;
	}

	const audience = $derived(allowedForAudience(candidates, visibility));
	const people = $derived(active ? suggest(active.query, audience).people : []);
	// The second line counts everyone the list could offer, not only what the query left.
	const peopleContext = usePeopleContext();
	const namesakes = $derived(tellApart(audience, peopleContext()));
	// Asked the way the server would refuse it, before saving is offered (docs/02 §2.2.3).
	const unclearNow = $derived(unclearHandles(value, audience, peopleContext()));
	$effect(() => {
		unclear = unclearNow.length > 0;
	});

	/*
	 * A caret moved by the arrow keys may have entered or left an @-handle, so the list is asked
	 * again — except for Up and Down while the list is open: those moved its highlight on
	 * keydown, and asking again would put it straight back on the first row.
	 */
	function onKeyup(event: KeyboardEvent) {
		if (!event.key.startsWith('Arrow')) return;
		const listOpen = (active && people.length > 0) || tagPicker.open;
		if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && listOpen) return;
		refreshPicker();
	}

	function refreshPicker() {
		if (!textarea) return;
		active = activeHandle(text, textarea.selectionStart);
		selected = 0;
		if (tags) tagPicker.follow(text, textarea.selectionStart);
	}

	function onInput(event: Event) {
		changeText((event.currentTarget as HTMLTextAreaElement).value);
		refreshPicker();
	}

	async function choose(index: number) {
		const person = people[index];
		if (!person || !active || !textarea) return;
		const handle = handleFor(person);
		const r = insertHandle(text, active, textarea.selectionStart, handle);
		changeText(r.text, { start: active.start, end: active.start + handle.length, id: person.id });
		active = null;
		await tick();
		textarea.focus();
		textarea.setSelectionRange(r.caret, r.caret);
	}

	async function chooseTag(index: number) {
		if (!textarea) return;
		const r = tagPicker.choose(text, textarea.selectionStart, index);
		if (!r) return;
		changeText(r.text);
		await tick();
		textarea.focus();
		textarea.setSelectionRange(r.caret, r.caret);
	}

	// A posted form carries the stored form, whoever builds its data — a plain post, `enhance`
	// or `new FormData(form)`.
	onMount(() => {
		const form = textarea?.form;
		if (!form) return;
		const carryStored = (event: FormDataEvent) => event.formData.set(name, value);
		form.addEventListener('formdata', carryStored);
		return () => form.removeEventListener('formdata', carryStored);
	});

	/*
	 * Closing on blur has to survive the focus coming straight back, as in PersonSearchSelect:
	 * someone who clicks away and at once types again would otherwise watch the list they just
	 * opened shut under them when the earlier blur's timer runs out.
	 */
	function closeIfFocusLeft() {
		if (document.activeElement === textarea) return;
		active = null;
		tagPicker.close();
	}

	function onKeydown(event: KeyboardEvent) {
		if (tagPicker.key(event, (i) => void chooseTag(i))) return;
		if (!active || people.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selected = (selected + 1) % people.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selected = (selected - 1 + people.length) % people.length;
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			void choose(selected);
		} else if (event.key === 'Escape') {
			// Consumed — see PersonSearchSelect: Escape closes the suggestion list, not the
			// form it sits in (docs/05 §5.7).
			event.preventDefault();
			active = null;
		}
	}
</script>

<div class="relative">
	<textarea
		bind:this={textarea}
		value={text}
		{name}
		{rows}
		{required}
		{placeholder}
		aria-label={label}
		aria-autocomplete="list"
		aria-controls={tagPicker.open ? tagListId : listboxId}
		aria-activedescendant={tagPicker.open
			? tagOptionId(tagPicker.highlighted)
			: active && people[selected]
				? optionId(selected)
				: undefined}
		onkeydown={onKeydown}
		oninput={onInput}
		onclick={refreshPicker}
		onkeyup={onKeyup}
		onblur={() => setTimeout(closeIfFocusLeft, BLUR_CLOSE_MS)}
		class={className}></textarea>

	{#if active && people.length > 0}
		<MentionListbox
			id={listboxId}
			{people}
			highlighted={selected}
			{optionId}
			{namesakes}
			onchoose={(i) => void choose(i)}
			onhighlight={(i) => (selected = i)}
		/>
	{/if}
	{#if tagPicker.open}
		<TagListbox
			id={tagListId}
			rows={tagPicker.rows}
			highlighted={tagPicker.highlighted}
			optionId={tagOptionId}
			onchoose={(i) => void chooseTag(i)}
			onhighlight={(i) => (tagPicker.highlighted = i)}
			class="top-full left-2 -mt-1"
		/>
	{/if}
	{#if tags}
		<div class="mt-1.5"><TagsLine body={value} known={tags} /></div>
	{/if}
	{#if unclearNow.length}
		<div class="mt-2"><WhichNamesake unclear={unclearNow} /></div>
	{/if}
</div>
