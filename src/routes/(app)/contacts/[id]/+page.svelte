<script lang="ts">
	import IdentityCard from '$lib/components/person/IdentityCard.svelte';
	import JumpBar from '$lib/components/person/JumpBar.svelte';
	import MentionsSection from '$lib/components/person/MentionsSection.svelte';
	import NotesSection from '$lib/components/person/NotesSection.svelte';
	import PhotosSection from '$lib/components/person/PhotosSection.svelte';
	import RelationshipsSection from '$lib/components/person/RelationshipsSection.svelte';
	import StorySection from '$lib/components/person/StorySection.svelte';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { tick } from 'svelte';
	import type { ActionData, PageData } from './$types';

	/*
	 * A person's page (docs/05 §5.5): one column of full-width cards in the order a reader asks
	 * their questions — who this is, who they belong with, what was taken — then what happened
	 * and what was written down, side by side on a wide screen, and last, quietly, where somebody
	 * else named them. Everything about the record rather than the person is in the identity
	 * card's ⋯ menu.
	 *
	 * Every form is closed until asked for, so the page reads as a person rather than as a stack
	 * of empty inputs. Each card is its own component under `$lib/components/person/`; this page
	 * lays them out and holds only what more than one of them shares.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();
	// Candidate targets for a new relationship: everyone visible but this person, from the
	// shell's list rather than a second copy of it in this page's data.
	const otherContacts = $derived(data.people.filter((p) => p.id !== data.contact.id));

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	// The menu's "Log contact" opens the story card's form; the card owns the state.
	let logOpen = $state(false);
	function logContact() {
		logOpen = true;
	}

	// The menu's "How are we connected?" asks on the relationships card, which holds the picker.
	let tracingPath = $state(false);
	async function tracePath() {
		tracingPath = true;
		await tick();
		document.getElementById(sectionAnchor('relationships'))?.scrollIntoView({ block: 'start' });
		document.getElementById('path-target')?.focus();
	}

	/*
	 * Photos of two people together, from Immich (docs/02 §2.24.7): the pair a relationship row's
	 * *Together* asked for, and the pair the Photos card's strip shows. Both belong to this person,
	 * so another person's page starts on their own photos again.
	 */
	let immichTogether = $state<{ askedByRow: string | null; shown: string | null }>({ askedByRow: null, shown: null });
	// A primitive, so a reload of this same person's data (a save) is not read as a new person.
	const contactId = $derived(c.id);
	$effect(() => {
		void contactId;
		immichTogether = { askedByRow: null, shown: null };
	});
	async function showTogether(contactId: string) {
		immichTogether = { askedByRow: contactId, shown: contactId };
		await tick();
		document.getElementById(sectionAnchor('photos'))?.scrollIntoView({ block: 'start' });
		// The chip now pressed, so a keyboard or a screen reader lands where the photos changed.
		document.querySelector<HTMLElement>('[data-testid="immich-together"] [aria-pressed="true"]')?.focus();
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

<main class="mx-auto flex w-full max-w-[66.25rem] flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
	<IdentityCard {data} {form} {otherContacts} {metLine} {isSelf} {archived} {logContact} {tracePath} />

	<!-- Sticks under the top bar once the identity card has gone by (docs/05 §5.5). -->
	<JumpBar {data} />

	<RelationshipsSection {data} {form} {otherContacts} {showTogether} bind:tracingPath />

	<PhotosSection {data} {form} bind:together={immichTogether} />

	<!-- What happened beside what was written down; stacked, story first, below `lg`. -->
	<div class="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
		<StorySection {data} {form} {otherContacts} bind:logOpen />
		<NotesSection {data} {form} {otherContacts} />
	</div>

	<MentionsSection {data} />
</main>
