import { faceLookup } from '$lib/story/subjects';
import { error, redirect } from '@sveltejs/kit';
import { requireRemover, requireUser, requireViewer } from '$lib/server/auth/guards';
import { CONTACT_FIELD_KINDS } from '$lib/people/contact-fields';
import { parseProposePairs } from '$lib/people/propose';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { shownNameIsChosen } from '$lib/people/display-name';
import { IMPORTANT_DATE_KINDS } from '$lib/dates/kinds';
import { INTERACTION_KINDS } from '$lib/server/domain/interactions/interactions';
import { contactSectionPath, RELATE_AS_PARAM, sectionForLegacyTab } from '$lib/people/sections';
import { personMap } from '$lib/graph/model/person-map';
import { orderOpenTodos } from '$lib/todos/todos';
import { todayFor } from '$lib/dates/today';
import { systemClock } from '$lib/server/clock';
import { TAG_COLORS } from '$lib/design/tag-colors';
import { readTogetherOffers } from '$lib/server/domain/immich/glimpse';
import { readImmichLink, readLinkedPerson } from '$lib/server/domain/immich/links';
import { togetherCandidates } from '$lib/immich/together';
import { canAddRelationshipTo } from '$lib/server/access/visibility';
import { say, translator } from '$lib/server/i18n/say';
import {
	birthdayOf,
	declinedBy,
	circleNamesIn,
	fieldView,
	galleryPhotoView,
	giftView,
	todoView,
	mentionedInView,
	noteView,
	peopleNamedIn,
	withReasonsSaid,
	type PersonViewContext
} from './person-view';
import { REVIEW_PARAM } from './review-path';
import { immichPhotosOfEntries } from '$lib/server/domain/immich/entry-immich-photos';
import { entryIdsOf, nameLookup, photosByEntry, toStoryItem } from './story-view';
import { lastNameChips, readPersonPage } from './read-person-page';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, params, url }) => {
	const user = requireUser(locals);
	const viewer = requireViewer(locals);
	// Whether *Remove* shows on someone else's note turns on the role (docs/03 §3.7).
	const remover = requireRemover(locals);

	/*
	 * The page had tabs until its content became one column of cards (docs/05 §5.5). A
	 * bookmark or a history entry still carrying `?tab=` is answered with the card it meant,
	 * rather than silently landing at the top of the page. After the sign-in check, so an
	 * old link cannot bounce a signed-out reader anywhere but the login page.
	 */
	const legacy = sectionForLegacyTab(url.searchParams.get('tab'));
	if (legacy) throw redirect(302, contactSectionPath(params.id, legacy));

	const contact = await getContact(locals.services.people.contactDeps, viewer, params.id);
	// 404 for both "missing" and "not visible to you" — never reveal existence.
	if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

	const reviewOpen = url.searchParams.has(REVIEW_PARAM);
	const proposeFor = url.searchParams.get('propose');
	const read = await readPersonPage(locals.services, viewer, params.id, {
		reviewOpen,
		proposeFor: parseProposePairs(proposeFor)
	});
	// Which Immich person they are, when this instance has Immich (docs/02 §2.24.2).
	const { immich } = locals.services;
	const immichLinkDeps = immich?.immichLinkDeps;
	const immichLink = immichLinkDeps
		? await readImmichLink(immichLinkDeps, viewer, params.id)
		: null;
	// Whom photos together are offered with: the viewer's own person and the closest ties, when linked too.
	const immichTogether =
		immichLinkDeps && immichLink
			? await readTogetherOffers(
					immichLinkDeps,
					viewer,
					params.id,
					togetherCandidates({
						pageContactId: params.id,
						selfContactId: user.selfContactId,
						ties: read.family.ties
					})
				)
			: [];

	// Only the photos of the entries on the story's first page; later pages bring their own.
	const storyEntryIds = entryIdsOf(read.storyPage.items);
	const [journalPhotos, immichPhotosByEntry] = await Promise.all([
		locals.services.media.journalPhotos.listJournalPhotosOfEntries(
			viewer,
			params.id,
			storyEntryIds
		),
		immichPhotosOfEntries(
			{
				reads: locals.services.media.entryImmichPhotos,
				signer: locals.services.immich?.signer ?? null
			},
			viewer,
			params.id,
			storyEntryIds
		)
	]);

	const named = peopleNamedIn(read.family.graph);
	const ctx: PersonViewContext = {
		viewerId: viewer.id,
		// The visible graph holds everyone the viewer may see, archived people included, so a
		// mention already written keeps its name (docs/02 §2.2) without a second read of them.
		nameOf: nameLookup(named),
		nameOfAuthor: read.nameOfAuthor
	};
	const t = translator(locals);
	const person = {
		householdId: contact.householdId,
		ownerId: contact.createdBy,
		visibility: contact.visibility
	};
	const storyContext = {
		...ctx,
		remover,
		person,
		photosByEntry: photosByEntry(journalPhotos),
		immichPhotosByEntry,
		faceOf: faceLookup(named)
	};

	return {
		// Who they are.
		contact,
		// A shown name a member chose does not follow its parts; the name editor says so (§2.2).
		shownNameChosen: shownNameIsChosen(contact),
		/*
		 * Last names (docs/02 §2.2.4.5, §2.2.4.6): the proposal for this person, as
		 * chips under the name, and whom a name given here is offered on to afterwards.
		 */
		lastNameHelp: {
			chips: lastNameChips(read.surnameHelp.proposal, t),
			passOn: read.surnameHelp.passOn
		},
		...birthdayOf(contact, read.dates),
		dates: read.dates,
		fields: read.fields.map(fieldView),
		// The addresses they share with others, and whom with (docs/02 §2.2).
		homes: read.homes,
		tags: read.tags,
		circles: read.contactCircles,

		// What happened with them: the story's first page, and their touchpoints.
		story: {
			items: read.storyPage.items.map((item) => toStoryItem(item, storyContext)),
			nextCursor: read.storyPage.nextCursor
		},
		// Of the touchpoints *this viewer* sees, so a private one never shows here.
		lastContactedAt: read.lastContactedAt,
		notes: read.notes.map((note) =>
			noteView(note, ctx, remover, {
				householdId: contact.householdId,
				ownerId: contact.createdBy,
				visibility: contact.visibility
			})
		),
		// Ideas, given and received gifts (docs/02 §2.25), already visibility-scoped.
		gifts: read.gifts.map((gift) => giftView(gift, ctx)),
		// What is still to do for them (docs/02 §2.26): open ones, those with a day first.
		todos: orderOpenTodos(read.todos).map((todo) => todoView(todo, ctx)),
		// The household's day, which the card's *overdue* and *by Fri, 6 Nov* are read against.
		today: todayFor(systemClock),
		mentionedIn: read.mentionedIn.map((reference) => mentionedInView(reference, ctx)),
		// The person's photo gallery (docs/02 §2.14), favourites first, already visibility-scoped.
		gallery: read.gallery.map((photo) => galleryPhotoView(photo, remover, person)),
		/*
		 * Immich (docs/02 §2.24.2): null when this instance has none, so the menu and
		 * the line never appear. What Immich says about a linked person is a promise on purpose —
		 * the page is sent at once and the line fills itself in, so a slow or absent Immich never
		 * holds the page up (docs/02 §2.24.3). `togetherWith` is whom the strip and the relationship
		 * rows offer photos together with (docs/02 §2.24.8).
		 */
		immich: immich ? { linked: immichLink !== null, togetherWith: immichTogether } : null,
		immichPerson: immich && immichLink ? readLinkedPerson(immich, immichLink.immichPersonId) : null,
		// Every group photo they were cut from, now and before (docs/02 §2.14).
		groupPhotos: read.groupPhotos,
		// Their circles' photos a profile picture can be cut from; none means choosing looks as before.
		groupPhotosToCut: read.groupPhotosToCut,

		// Who they belong with.
		relationships: read.family.ties,
		// How each of them is worded, so the card can say *daughter* rather than *Child* (docs/05 §5.5).
		tieWording: read.family.tieWording,
		// Inferred, never stored (docs/02 §2.4.1); shown apart from the entered links.
		derivedKin: read.family.kinship.derived,
		// Links implied by the ones just added — one, or a whole batch — offered for a confirmation each.
		proposals: withReasonsSaid(read.family.kinship.proposals, t),
		proposeFor,
		/*
		 * The on-demand review (docs/02 §2.4.1): what stands
		 * around this person right now, asked for rather than raised by a write. Closed, it
		 * costs nothing — no rule runs until somebody presses the control.
		 */
		review: {
			open: reviewOpen,
			suggestions: withReasonsSaid(read.family.reviewed, t),
			memberNames: declinedBy(read.family.reviewed, ctx.nameOfAuthor)
		},
		/*
		 * What the household's own records already rule out (docs/02 §2.4), so the picker can
		 * grey an entry out with the reason rather than let it be saved and refused. The rules
		 * are the ones the use-case is guarded by, run over the same facts.
		 */
		exclusionFacts: read.family.exclusionFacts,
		/** The person's own slice of the visible graph, for the map on their page (docs/05 §5.5). */
		graph: await personMap(read.family.graph, params.id),

		// What the forms on the page offer.
		relationshipTypes: read.relationshipTypes,
		// `?relate=<id>` pre-selects a person in the relationship form (the stream's link hint, §2.22.1).
		relateTo: url.searchParams.get('relate'),
		// `?as=<choice>` presets its type — the family tree's slot for a missing parent (§2.7).
		relateAs: url.searchParams.get(RELATE_AS_PARAM),
		// The map's slots for missing parents add a relationship, so only for who may (§2.7).
		mayAddRelationships: canAddRelationshipTo(viewer, person),
		circleNames: circleNamesIn(read.family.graph),
		// Roles already used per circle, so joining one offers what that circle calls its people.
		circleRolesByName: read.circleRolesByName,
		interactionKinds: INTERACTION_KINDS,
		dateKinds: IMPORTANT_DATE_KINDS,
		fieldKinds: CONTACT_FIELD_KINDS,
		tagColors: TAG_COLORS,

		// Who is looking: the gallery only offers caption/remove on your own photos, and
		// deleting a person for good is admin-only (docs/02 §2.2); archiving is for everyone.
		viewerId: viewer.id,
		isAdmin: user.role === 'admin'
	};
}) satisfies PageServerLoad;
