import { error, redirect } from '@sveltejs/kit';
import { CONTACT_FIELD_KINDS } from '$lib/contact-fields/kinds';
import { parseProposePairs } from '$lib/contacts/propose';
import { listContactFields } from '$lib/server/domain/contact-fields/contact-fields';
import {
	listCirclesForContact,
	listRoleSuggestionsByCircleName
} from '$lib/server/domain/circles/circles';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { shownNameIsChosen } from '$lib/people/display-name';
import { readSurnameHelp } from '$lib/server/domain/contacts/last-names';
import { textOf } from '$lib/i18n/linked';
import type { SurnameOption, SurnameProposal } from '$lib/suggestions/rules/surnames';
import type { Translate } from '$lib/i18n/translate';
import { listImportantDates } from '$lib/server/domain/dates/important-dates';
import { IMPORTANT_DATE_KINDS } from '$lib/dates/kinds';
import { INTERACTION_KINDS, lastContactedOn } from '$lib/server/domain/interactions/interactions';
import { authorNames } from '$lib/server/domain/household/members';
import { listStoryPage } from '$lib/server/domain/story/story';
import { listGroupPhotosOf, listGroupPhotosToCut } from '$lib/server/domain/media/cuts';
import { listGallery } from '$lib/server/domain/media/gallery';
import { contactSectionPath, sectionForLegacyTab } from '$lib/contacts/sections';
import { personMap } from '$lib/graph/model/person-map';
import { listMentionedIn } from '$lib/server/domain/mentions/mentioned-in';
import { listNotesForContact } from '$lib/server/domain/notes/notes';
import { readFamilyOf } from '$lib/server/domain/relationships/family';
import { listTagsForContact, TAG_COLORS } from '$lib/server/domain/tags/tags';
import { readTogetherOffers } from '$lib/server/domain/immich/glimpse';
import { readImmichLink, readLinkedPerson } from '$lib/server/domain/immich/links';
import { togetherCandidates } from '$lib/immich/together';
import {
	getContactDeps,
	getContactFieldDeps,
	getCircleDeps,
	getImportantDateDeps,
	getInteractionDeps,
	getNoteDeps,
	getCutDeps,
	getGalleryDeps,
	getFamilyReadDeps,
	getSurnameReviewDeps,
	getPhotos,
	getRelationshipTypes,
	getStoryDeps,
	getTagDeps,
	getMemberDeps,
	getMentionedInDeps,
	getImmich,
	getImmichLinkDeps
} from '$lib/server/services';
import type { Viewer } from '$lib/server/access/visibility';
import { say, translator } from '$lib/server/i18n/say';
import { allOf } from '$lib/async/all-of';
import {
	birthdayOf,
	declinedBy,
	circleNamesIn,
	fieldView,
	mentionedInView,
	noteView,
	peopleNamedIn,
	withReasonsSaid,
	type PersonViewContext
} from './person-view';
import { REVIEW_PARAM } from './review-path';
import { entryIdsOf, nameLookup, photosByEntry, STORY_PAGE_SIZE, toStoryItem } from './story-view';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	/*
	 * The page had tabs until its content became one column of cards (docs/05 §5.5). A
	 * bookmark or a history entry still carrying `?tab=` is answered with the card it meant,
	 * rather than silently landing at the top of the page. After the sign-in check, so an
	 * old link cannot bounce a signed-out reader anywhere but the login page.
	 */
	const legacy = sectionForLegacyTab(url.searchParams.get('tab'));
	if (legacy) throw redirect(302, contactSectionPath(params.id, legacy));

	const contact = await getContact(getContactDeps(), viewer, params.id);
	// 404 for both "missing" and "not visible to you" — never reveal existence.
	if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

	const reviewOpen = url.searchParams.has(REVIEW_PARAM);
	const proposeFor = url.searchParams.get('propose');
	const read = await readPersonPage(viewer, params.id, {
		reviewOpen,
		proposeFor: parseProposePairs(proposeFor)
	});
	// Which Immich person they are, when this instance has Immich (docs/02 §2.24.2).
	const immich = getImmich();
	const immichLinkDeps = getImmichLinkDeps();
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
						selfContactId: locals.user.selfContactId,
						ties: read.family.ties
					})
				)
			: [];

	// Only the photos of the entries on the story's first page; later pages bring their own.
	const journalPhotos = await getPhotos().listJournalPhotosOfEntries(
		viewer,
		params.id,
		entryIdsOf(read.storyPage.items)
	);

	const ctx: PersonViewContext = {
		viewerId: viewer.id,
		// The visible graph holds everyone the viewer may see, archived people included, so a
		// mention already written keeps its name (docs/02 §2.2) without a second read of them.
		nameOf: nameLookup(peopleNamedIn(read.family.graph)),
		nameOfAuthor: read.nameOfAuthor
	};
	const t = translator(locals);
	const storyContext = { ...ctx, userId: viewer.id, photosByEntry: photosByEntry(journalPhotos) };

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
		tags: read.tags,
		circles: read.contactCircles,

		// What happened with them: the story's first page, and their touchpoints.
		story: {
			items: read.storyPage.items.map((item) => toStoryItem(item, storyContext)),
			nextCursor: read.storyPage.nextCursor
		},
		// Of the touchpoints *this viewer* sees, so a private one never shows here.
		lastContactedAt: read.lastContactedAt,
		notes: read.notes.map((note) => noteView(note, ctx.nameOf)),
		mentionedIn: read.mentionedIn.map((reference) => mentionedInView(reference, ctx)),
		// The person's photo gallery (docs/02 §2.14), favourites first, already visibility-scoped.
		gallery: read.gallery,
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
		 * The on-demand review (docs/concepts/relationship-suggestions.md §6.5): what stands
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
		isAdmin: locals.user.role === 'admin'
	};
}) satisfies PageServerLoad;

/**
 * Everything the person page reads, at once and each under its own name. Every read goes
 * through a use-case scoped to the viewer; nothing here decides what anyone may see.
 */
function readPersonPage(
	viewer: Viewer,
	contactId: string,
	request: { reviewOpen: boolean; proposeFor: { a: string; b: string }[] }
) {
	return allOf({
		// The person's own records.
		dates: listImportantDates(getImportantDateDeps(), viewer, contactId),
		fields: listContactFields(getContactFieldDeps(), viewer, contactId),
		tags: listTagsForContact(getTagDeps(), viewer, contactId),
		contactCircles: listCirclesForContact(getCircleDeps(), viewer, contactId),
		storyPage: listStoryPage(getStoryDeps(), viewer, contactId, { limit: STORY_PAGE_SIZE }),
		lastContactedAt: lastContactedOn(getInteractionDeps(), viewer, contactId),
		notes: listNotesForContact(getNoteDeps(), viewer, contactId),
		mentionedIn: listMentionedIn(getMentionedInDeps(), viewer, contactId),
		gallery: listGallery(getGalleryDeps(), viewer, contactId),
		groupPhotos: listGroupPhotosOf(getCutDeps(), viewer, contactId),
		groupPhotosToCut: listGroupPhotosToCut(getCutDeps(), viewer, contactId),

		/*
		 * Their place in the family: their links, derived kin, proposals, the review, what the
		 * picker greys out and the map, all from one read of the visible graph. The map is cut
		 * from the same access-scoped snapshot the explorer route reads, and for the same reason:
		 * derived kinship is worked out over the whole visible graph, so an inference cut from a
		 * slice could name the wrong relative. Only the person's own slice is sent to the browser.
		 */
		family: readFamilyOf(getFamilyReadDeps(), viewer, contactId, request),
		surnameHelp: readSurnameHelp(getSurnameReviewDeps(), viewer, contactId),

		// What the forms offer, and who wrote what.
		nameOfAuthor: authorNames(getMemberDeps(), viewer.householdId),
		relationshipTypes: getRelationshipTypes().listTypes(viewer),
		circleRolesByName: listRoleSuggestionsByCircleName(getCircleDeps(), viewer)
	});
}

/** The proposal as the hero's chips: one name, or each of several equally sure ones (§3.4). */
function lastNameChips(proposal: SurnameProposal, t: Translate): { name: string; why: string }[] {
	const chip = (option: SurnameOption) => ({
		name: option.name,
		why: option.reasons.map((reason) => textOf(reason(t))).join(' · ')
	});
	if (proposal.kind === 'one') return [chip(proposal)];
	if (proposal.kind === 'choose') return proposal.options.map(chip);
	return [];
}
