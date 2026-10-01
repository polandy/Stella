<script lang="ts">
	import MentionsSection from '$lib/components/person/MentionsSection.svelte';
	import NotesSection from '$lib/components/person/NotesSection.svelte';
	import PersonHeader from '$lib/components/person/PersonHeader.svelte';
	import PersonProfile from '$lib/components/person/PersonProfile.svelte';
	import PhotosSection from '$lib/components/person/PhotosSection.svelte';
	import RelationshipsSection from '$lib/components/person/RelationshipsSection.svelte';
	import StorySection from '$lib/components/person/StorySection.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { ActionData, PageData } from './$types';

	/*
	 * A person's page (docs/05 §5.5): what they are to the household in one column, who they are
	 * in a quieter one beside it. The main column is a stack of cards in a fixed order —
	 * relationships, story, notes, photos, mentions — rather than tabs: the two that were read
	 * most were behind a click, and the four profile cards shouted louder than either.
	 *
	 * Every form is closed until asked for, so the page reads as a person rather than as a stack
	 * of empty inputs. Below `lg` the columns stack, main column first.
	 *
	 * Each card is its own component under `$lib/components/person/`; this page lays them out
	 * and holds only what more than one of them shares.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();
	// Candidate targets for a new relationship: everyone visible but this person, from the
	// shell's list rather than a second copy of it in this page's data.
	const otherContacts = $derived(data.people.filter((p) => p.id !== data.contact.id));

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	// The hero's "Log contact" opens the story section's form; the section owns the state.
	let logOpen = $state(false);

	// The hero's second action opens the story card's own form, wherever the reader is.
	function logContact() {
		logOpen = true;
	}

	/** How this person came into the household's life, as one line, or null. */
	const metLine = $derived.by(() => {
		const parts = [c.howWeMet, c.metPlace, c.metDate].filter(Boolean);
		return parts.length > 0 ? parts.join(' · ') : null;
	});

	/** Archived or not decides the action, the wording and the marker; asked once. */
	const archived = $derived(c.archivedAt !== null);
	/** This record is the viewer's own person (docs/02 §2.1.3). */
	const isSelf = $derived(data.user.selfContactId === c.id);
</script>

<svelte:head><title>{t('contact.title', { name: c.displayName })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<PersonHeader {data} {form} {metLine} {isSelf} {archived} {logContact} />

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
		<!--
			Who they are, quietly. Second everywhere now, and one card rather than four: contact
			details, dates, circles and tags are looked *up*, not read, and four shadowed cards
			made them shout over the story (docs/05 §5.5).
		-->
		<div class="order-2 flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
			<PersonProfile {data} {form} {otherContacts} {metLine} {isSelf} {archived} />

		</div>

		<!--
			What this person is to the household, in the order it is asked for: who they are
			connected to, what has happened, what was written down, what was taken, and where
			somebody else named them. Each card carries its own anchor, so a link can point at
			one (docs/05 §5.5).
		-->
		<div class="order-1 flex min-w-0 flex-col gap-4">
			<RelationshipsSection {data} {form} {otherContacts} />

			<StorySection {data} {form} {otherContacts} bind:logOpen />

			<NotesSection {data} {form} {otherContacts} />

			<PhotosSection {data} {form} />

			<MentionsSection {data} />
		</div>
	</div>
</main>
