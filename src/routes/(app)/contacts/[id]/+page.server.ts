import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parseCommand, parsePhotoCommand } from '$lib/server/commands/parse';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { RELATIONS } from '$lib/suggestions/types';
import { GENDERS } from '$lib/people/gender';
import { requireAdmin } from '$lib/server/auth/guards';
import { CONTACT_FIELD_KINDS } from '$lib/contact-fields/kinds';
import { parseProposePair, proposeHref } from '$lib/contacts/propose';
import { listContactFields } from '$lib/server/domain/contact-fields/contact-fields';
import {
	listCircles,
	listCirclesForContact,
	listRoleSuggestionsByCircleName,
	removeMember
} from '$lib/server/domain/circles/circles';
import {
	archiveContact,
	deleteContact,
	mergeContacts,
	editProfile,
	EmptyContactNameError,
	InvalidGenderError,
	setGender,
	getContact,
	listContactNames,
	listContacts,
	restoreContact
} from '$lib/server/domain/contacts/contacts';
import { listImportantDates } from '$lib/server/domain/dates/important-dates';
import { IMPORTANT_DATE_KINDS } from '$lib/dates/kinds';
import {
	deleteInteraction,
	INTERACTION_KINDS,
	lastContactedAt,
	listInteractions
} from '$lib/server/domain/interactions/interactions';
import { deleteJournalEntry } from '$lib/server/domain/journal/journal';
import { authorNames } from '$lib/server/domain/household/members';
import { listStoryPage } from '$lib/server/domain/story/story';
import { decodeRelationshipChoice } from '$lib/relationships/type-options';
import { InvalidAvatarError, setContactAvatar } from '$lib/server/domain/media/avatars';
import {
	captionGalleryPhoto,
	CaptionTooLongError,
	listGallery,
	removeGalleryPhoto,
	setGalleryPhotoVisibility
} from '$lib/server/domain/media/gallery';
import { frameAsAvatar } from '$lib/server/domain/media/framing';
import { contactSectionPath, sectionForLegacyTab } from '$lib/contacts/sections';
import { personMap } from '$lib/graph/model/person-map';
import { listMentionedIn } from '$lib/server/domain/mentions/mentioned-in';
import { listNotesForContact } from '$lib/server/domain/notes/notes';
import {
	ContradictoryRelationshipError,
	DuplicateRelationshipError,
	editRelationship,
	InvalidRelationshipDetailsError,
	removeRelationship,
	readKinship,
	readExclusionFacts,
	RelationshipExcludedError
} from '$lib/server/domain/relationships/relationships';
import {
	acceptClaim,
	declineClaim,
	restoreClaim
} from '$lib/server/relationships/suggestion-answers';
import { reviewPerson } from '$lib/server/domain/relationships/suggestion-review';
import {
	listTagsForContact,
	pruneOrphanTags,
	TAG_COLORS,
	unassignTag
} from '$lib/server/domain/tags/tags';
import {
	getCommandDeps,
	getContactDeps,
	getContactFieldDeps,
	getAvatarDeps,
	getCircleDeps,
	getContactFields,
	getImportantDateDeps,
	getImportantDates,
	getInteractionDeps,
	getJournalDeps,
	getNoteDeps,
	getGalleryDeps,
	getFramingDeps,
	getGraphRepository,
	getPhotos,
	getRelationshipDeps,
	getSuggestionReviewDeps,
	getDeleteContactDeps,
	getRelationships,
	getRelationshipTypes,
	getStoryDeps,
	getTagDeps,
	getMemberDeps,
	getMentionedInDeps,
	getSelfContactDeps
} from '$lib/server/services';
import {
	setSelfContact,
	UnknownSelfContactError
} from '$lib/server/domain/household/self-contact';
import type { Viewer } from '$lib/server/access/visibility';
import { say, translator } from '$lib/server/i18n/say';
import { allOf } from '$lib/async/all-of';
import {
	birthdayOf,
	declinedBy,
	fieldView,
	interactionView,
	mentionedInView,
	noteView,
	withReasonsSaid,
	type PersonViewContext
} from './person-view';
import { nameLookup, photosByEntry, STORY_PAGE_SIZE, toStoryItem } from './story-view';
import type { Actions, PageServerLoad } from './$types';

/*
 * The on-demand review (docs/concepts/relationship-suggestions.md §6.5) hangs on the URL
 * rather than on component state: pressing *Check suggestions* is a page the household can
 * reload, come back to, and keep after confirming one of the rows. What was declined comes
 * with it, behind a disclosure — so a *no* is never out of reach and costs no second request.
 */
const REVIEW_PARAM = 'review';

/** The person page with the review panel open, back at the relationships card. */
const reviewPath = (contactId: string) => `/contacts/${contactId}?${REVIEW_PARAM}#relationships`;

/** The claim a review form is answering: the relation and the two people. */
async function parseAnswer(request: Request) {
	const form = await request.formData();
	return v.safeParse(AnswerSuggestionSchema, {
		relation: form.get('relation'),
		fromId: form.get('fromId'),
		toId: form.get('toId')
	});
}
export const load: PageServerLoad = async ({ locals, params, url }) => {
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
	const read = await readPersonPage(viewer, params.id, { reviewOpen, proposeFor });

	const ctx: PersonViewContext = {
		viewerId: viewer.id,
		nameOf: nameLookup(read.contactNames),
		nameOfAuthor: read.nameOfAuthor
	};
	const t = translator(locals);
	const storyContext = { ...ctx, userId: viewer.id, photosByEntry: photosByEntry(read.journalPhotos) };

	return {
		// Who they are.
		contact,
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
		interactions: read.interactions.map((interaction) => interactionView(interaction, viewer.id)),
		// Derived from the list *this viewer* sees, so a private touchpoint never shows here.
		lastContactedAt: lastContactedAt(read.interactions),
		notes: read.notes.map((note) => noteView(note, ctx.nameOf)),
		mentionedIn: read.mentionedIn.map((reference) => mentionedInView(reference, ctx)),
		// The person's photo gallery (docs/02 §2.14), newest first, already visibility-scoped.
		gallery: read.gallery,

		// Who they belong with.
		relationships: read.relationships,
		// Inferred, never stored (docs/02 §2.4.1); shown apart from the entered links.
		derivedKin: read.kinship.derived,
		// Links implied by the one just added, offered for a single confirmation each.
		proposals: withReasonsSaid(read.kinship.proposals, t),
		proposeFor,
		/*
		 * The on-demand review (docs/concepts/relationship-suggestions.md §6.5): what stands
		 * around this person right now, asked for rather than raised by a write. Closed, it
		 * costs nothing — no rule runs until somebody presses the control.
		 */
		review: {
			open: reviewOpen,
			suggestions: withReasonsSaid(read.reviewed, t),
			memberNames: declinedBy(read.reviewed, ctx.nameOfAuthor)
		},
		/*
		 * What the household's own records already rule out (docs/02 §2.4), so the picker can
		 * grey an entry out with the reason rather than let it be saved and refused. The rules
		 * are the ones the use-case is guarded by, run over the same facts.
		 */
		exclusionFacts: read.exclusionFacts,
		/** The person's own slice of the visible graph, for the map on their page (docs/05 §5.5). */
		graph: await personMap(read.visibleGraph, params.id),

		// What the forms on the page offer.
		relationshipTypes: read.relationshipTypes,
		// `?relate=<id>` pre-selects a person in the relationship form (the stream's link hint, §2.22.1).
		relateTo: url.searchParams.get('relate'),
		circleNames: read.allCircles.map((c) => c.name),
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
};

/**
 * Everything the person page reads, at once and each under its own name. Every read goes
 * through a use-case scoped to the viewer; nothing here decides what anyone may see.
 */
function readPersonPage(
	viewer: Viewer,
	contactId: string,
	request: { reviewOpen: boolean; proposeFor: string | null }
) {
	return allOf({
		// The person's own records.
		dates: listImportantDates(getImportantDateDeps(), viewer, contactId),
		fields: listContactFields(getContactFieldDeps(), viewer, contactId),
		tags: listTagsForContact(getTagDeps(), viewer, contactId),
		contactCircles: listCirclesForContact(getCircleDeps(), viewer, contactId),
		storyPage: listStoryPage(getStoryDeps(), viewer, contactId, { limit: STORY_PAGE_SIZE }),
		journalPhotos: getPhotos().listJournalPhotos(viewer, contactId),
		interactions: listInteractions(getInteractionDeps(), viewer, contactId),
		notes: listNotesForContact(getNoteDeps(), viewer, contactId),
		mentionedIn: listMentionedIn(getMentionedInDeps(), viewer, contactId),
		gallery: listGallery(getGalleryDeps(), viewer, contactId),

		// Their place in the family.
		relationships: getRelationships().listForContactVisibleTo(viewer, contactId),
		kinship: readKinship(getSuggestionReviewDeps(), viewer, contactId, parseProposePair(request.proposeFor)),
		reviewed: request.reviewOpen
			? reviewPerson(getSuggestionReviewDeps(), viewer, contactId, { includeDismissed: true })
			: Promise.resolve([]),
		exclusionFacts: readExclusionFacts(getRelationshipDeps(), viewer, contactId),
		/*
		 * The map on the page (docs/05 §5.5) is cut from the same access-scoped snapshot the
		 * explorer route reads, and for the same reason: derived kinship is worked out over the
		 * whole visible graph, so an inference cut from a slice could name the wrong relative.
		 * Only the person's own slice is sent to the browser.
		 */
		visibleGraph: getGraphRepository().loadVisibleGraph(viewer),

		// The household around them: names to read mentions by, and what the forms offer.
		// Archived people are out of `allContacts`, but a mention already written still names
		// them — so the name lookup reads the visibility scope (docs/02 §2.2).
		contactNames: listContactNames(getContactDeps(), viewer),
		nameOfAuthor: authorNames(getMemberDeps(), viewer.householdId),
		allContacts: listContacts(getContactDeps(), viewer),
		relationshipTypes: getRelationshipTypes().listTypes(viewer),
		allCircles: listCircles(getCircleDeps(), viewer),
		circleRolesByName: listRoleSuggestionsByCircleName(getCircleDeps(), viewer)
	});
}

const EditProfileSchema = v.object({
	displayName: v.pipe(v.string(), v.trim(), v.minLength(1)),
	description: v.optional(v.pipe(v.string(), v.trim()))
});

/** One of the three, or empty for taking the gender off the record (docs/02 §2.2). */
const GenderSchema = v.union([v.picklist(GENDERS), v.literal('')]);

/** The specifics of a link (docs/02 §2.4); the domain has the last word on what is real. */
const RelationshipDetailsSchema = {
	description: v.optional(v.pipe(v.string(), v.trim())),
	sinceDate: v.optional(v.pipe(v.string(), v.trim())),
	status: v.optional(v.pipe(v.string(), v.trim()))
};

const AddRelationshipSchema = v.object({
	targetId: v.pipe(v.string(), v.minLength(1)),
	/** Type *and* direction, as `relationshipTypeOptions` encodes them. */
	typeChoice: v.pipe(v.string(), v.minLength(1)),
	...RelationshipDetailsSchema
});

const EditRelationshipSchema = v.object({
	relationshipId: v.pipe(v.string(), v.minLength(1)),
	/** Type *and* direction, as `relationshipTypeOptions` encodes them; absent leaves the type. */
	typeChoice: v.optional(v.pipe(v.string(), v.minLength(1))),
	...RelationshipDetailsSchema
});

/** Visibility of a newly uploaded gallery photo (docs/02 §2.14). */
const VisibilitySchema = v.optional(v.picklist(['shared', 'private']), 'shared');

const PhotoVisibilitySchema = v.object({
	photoId: v.pipe(v.string(), v.minLength(1)),
	visibility: v.picklist(['shared', 'private'])
});

/** One claim a member is answering on the review panel (§6.4): the relation and the pair. */
const AnswerSuggestionSchema = v.object({
	relation: v.picklist(RELATIONS),
	fromId: v.pipe(v.string(), v.minLength(1)),
	toId: v.pipe(v.string(), v.minLength(1))
});

/** One confirmed propagation suggestion (docs/02 §2.4.1). */
const AddProposedSchema = v.object({
	fromId: v.pipe(v.string(), v.minLength(1)),
	toId: v.pipe(v.string(), v.minLength(1)),
	typeId: v.picklist(['parent_child', 'sibling']),
	propose: v.optional(v.pipe(v.string(), v.trim()))
});

const AddNoteSchema = v.object({
	body: v.pipe(v.string(), v.trim(), v.minLength(1)),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
	isPinned: v.optional(v.boolean(), false)
});

const AddFieldSchema = v.object({
	kind: v.picklist(CONTACT_FIELD_KINDS),
	label: v.optional(v.pipe(v.string(), v.trim())),
	value: v.pipe(v.string(), v.trim(), v.minLength(1))
});

const AddDateSchema = v.object({
	kind: v.picklist(IMPORTANT_DATE_KINDS),
	label: v.optional(v.pipe(v.string(), v.trim())),
	date: v.pipe(v.string(), v.minLength(1)),
	recursYearly: v.optional(v.boolean(), true),
	remind: v.optional(v.boolean(), true)
});

const LogInteractionSchema = v.object({
	kind: v.picklist(INTERACTION_KINDS),
	happenedAt: v.pipe(v.string(), v.minLength(1)),
	title: v.optional(v.pipe(v.string(), v.trim())),
	description: v.optional(v.pipe(v.string(), v.trim())),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
	participantIds: v.array(v.pipe(v.string(), v.minLength(1)))
});

const AddTagSchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	color: v.optional(v.picklist(TAG_COLORS))
});

export const actions: Actions = {
	/* The hero's name and description, edited in place (docs/02 §2.2). */
	editProfile: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(EditProfileSchema, {
			displayName: form.get('displayName'),
			description: form.get('description') || undefined
		});
		if (!parsed.success) return fail(400, { profileError: say(locals, 'errors.contact.emptyName') });

		try {
			const saved = await editProfile(getContactDeps(), viewer, params.id, {
				displayName: parsed.output.displayName,
				description: parsed.output.description ?? null
			});
			if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));
		} catch (err) {
			if (err instanceof EmptyContactNameError)
				return fail(400, { profileError: err.phrase(translator(locals)) });
			throw err;
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	/* A gender from the profile's chips; an empty value takes it off the record (docs/02 §2.2). */
	setGender: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const parsed = v.safeParse(GenderSchema, (await request.formData()).get('gender') ?? '');
		if (!parsed.success) return fail(400, { genderError: say(locals, 'errors.contact.invalidGender') });

		try {
			const saved = await setGender(getContactDeps(), viewer, params.id, parsed.output || null);
			if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));
		} catch (err) {
			if (err instanceof InvalidGenderError) return fail(400, { genderError: err.phrase(translator(locals)) });
			throw err;
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	/*
	 * Merging a duplicate into this person (docs/02 §2.2). Admin only for the same reason as
	 * deleting: it ends a record, and there is no way back.
	 */
	merge: async ({ request, params, locals }) => {
		const user = requireAdmin(locals);
		const viewer = { id: user.id, householdId: user.householdId };
		const parsed = v.safeParse(
			v.object({ mergedId: v.pipe(v.string(), v.minLength(1)) }),
			Object.fromEntries(await request.formData())
		);
		if (!parsed.success) return fail(400, { mergeError: say(locals, 'errors.merge.choose') });

		const merged = await mergeContacts(getContactDeps(), viewer, params.id, parsed.output.mergedId);
		if (!merged) return fail(400, { mergeError: say(locals, 'errors.merge.failed') });
		throw redirect(303, `/contacts/${params.id}`);
	},

	/*
	 * Deleting for good (docs/02 §2.2). Admin only, like the other irreversible tools in
	 * Settings → Data: archiving is there for everyone, and this is the one that cannot be
	 * taken back. The visibility scope still applies, so an admin cannot reach another
	 * member's private contact.
	 */
	delete: async ({ params, locals }) => {
		const user = requireAdmin(locals);
		const viewer = { id: user.id, householdId: user.householdId };
		const done = await deleteContact(getDeleteContactDeps(), viewer, params.id);
		if (!done) throw error(404, say(locals, 'errors.contact.notFound'));
		// Their tag assignments went with them by cascade, so a tag they were the last
		// carrier of is orphaned here rather than by `unassignTag` (docs/02 §2.8).
		await pruneOrphanTags(getTagDeps(), user.householdId);
		throw redirect(303, '/contacts');
	},

	/*
	 * Archiving (docs/02 §2.2): out of the household's lists, not out of its history. An
	 * archived person keeps their page — this is where they are brought back from — and stays
	 * in the graph and the kinship Stella works out (docs/04 §4.9).
	 */
	archive: async ({ params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const done = await archiveContact(getContactDeps(), viewer, params.id);
		if (!done) throw error(404, say(locals, 'errors.contact.notFound'));
		throw redirect(303, `/contacts/${params.id}`);
	},

	/*
	 * "This is me" (docs/02 §2.1.3), from the page of the person it is about. It toggles: the
	 * same button lets go of the link again, so a wrong pick is undone where it was made.
	 */
	setSelf: async ({ params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const alreadyMe = locals.user.selfContactId === params.id;

		try {
			await setSelfContact(getSelfContactDeps(), viewer, alreadyMe ? null : params.id);
		} catch (err) {
			if (err instanceof UnknownSelfContactError)
				return fail(400, { error: err.phrase(translator(locals)) });
			throw err;
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	restore: async ({ params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const done = await restoreContact(getContactDeps(), viewer, params.id);
		if (!done) throw error(404, say(locals, 'errors.contact.notFound'));
		throw redirect(303, `/contacts/${params.id}`);
	},

	addRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const parsed = v.safeParse(AddRelationshipSchema, {
			targetId: form.get('targetId'),
			typeChoice: form.get('typeChoice'),
			description: form.get('description') || undefined,
			sinceDate: form.get('sinceDate') || undefined,
			status: form.get('status') || undefined
		});
		if (!parsed.success) {
			return fail(400, { error: say(locals, 'errors.relationship.needPersonAndType') });
		}

		// A command (docs/04 §4.11.2), named by the form so one kept on the phone is recognised;
		// `addRelationshipChecked` holds every check the page used to make here.
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'relationship.add',
			payload: { contactId: params.id, ...parsed.output },
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'relationship.add') {
			return fail(400, { error: say(locals, 'errors.relationship.needPersonAndType') });
		}
		const author = { userId: locals.user.id, householdId: locals.user.householdId };
		const outcome = await dispatchCommand(getCommandDeps(), author, command).catch(() => null);
		if (outcome?.status !== 'applied') {
			return fail(outcome?.status === 'refused' ? 409 : 400, {
				error:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.relationship.couldNotAdd')
			});
		}

		// Come back with the new pair named, so its implied links can be offered.
		throw redirect(303, proposeHref(params.id, parsed.output.targetId));
	},

	/** Correct a link: its specifics, and its type where the tie was named wrongly (docs/02 §2.4). */
	editRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(EditRelationshipSchema, {
			relationshipId: form.get('relationshipId'),
			typeChoice: form.get('typeChoice') || undefined,
			description: form.get('description') || undefined,
			sinceDate: form.get('sinceDate') || undefined,
			status: form.get('status') || undefined
		});
		if (!parsed.success) return fail(400, { error: say(locals, 'errors.relationship.couldNotSave') });

		// A choice the picker did not write names no type and no side, so it cannot be stored.
		const choice = parsed.output.typeChoice
			? decodeRelationshipChoice(parsed.output.typeChoice)
			: null;
		if (parsed.output.typeChoice && !choice) {
			return fail(400, { error: say(locals, 'errors.relationship.couldNotSave') });
		}

		try {
			const saved = await editRelationship(getRelationshipDeps(), viewer, {
				relationshipId: parsed.output.relationshipId,
				perspectiveContactId: params.id,
				typeChoice: choice,
				description: parsed.output.description ?? null,
				sinceDate: parsed.output.sinceDate ?? null,
				status: parsed.output.status ?? null
			});
			if (!saved) return fail(404, { error: say(locals, 'errors.relationship.notFound') });
		} catch (err) {
			if (err instanceof DuplicateRelationshipError) {
				return fail(409, { error: say(locals, 'errors.relationship.duplicate') });
			}
			if (err instanceof ContradictoryRelationshipError) {
				return fail(409, { error: say(locals, 'errors.relationship.contradiction') });
			}
			// The picker greys these out, so this is the hand-written post — refused all the same.
			if (err instanceof RelationshipExcludedError) {
				return fail(409, { error: err.phrase(translator(locals)) });
			}
			if (err instanceof InvalidRelationshipDetailsError) {
				return fail(400, { error: err.phrase(translator(locals)) });
			}
			throw err;
		}

		throw redirect(303, contactSectionPath(params.id, 'relationships'));
	},

	/** Take back a link that was entered wrong (docs/02 §2.4). Undo is the page's own. */
	removeRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const relationshipId = form.get('relationshipId');
		if (typeof relationshipId !== 'string') return fail(400, {});

		if (!(await removeRelationship(getRelationshipDeps(), viewer, relationshipId))) {
			return fail(404, { error: say(locals, 'errors.relationship.notFound') });
		}
		throw redirect(303, contactSectionPath(params.id, 'relationships'));
	},

	/**
	 * Store one propagation suggestion (docs/02 §2.4.1). Both endpoints are checked against
	 * the viewer, and the pair is carried on so the remaining suggestions stay on screen.
	 */
	addProposedRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const refusal = await acceptClaim(locals, viewer, form);
		if (refusal) return fail(refusal.status, { error: refusal.message });

		// The pointer the block hangs on, so confirming one row keeps the others on screen.
		const propose = form.get('propose');
		const back = typeof propose === 'string' && propose ? `?propose=${propose}` : '';
		throw redirect(303, `/contacts/${params.id}${back}#relationships`);
	},

	/**
	 * Decline a claim, so it stops being offered however a rule reaches it later
	 * (docs/concepts/relationship-suggestions.md §6.4). The household decided, so the *no*
	 * holds for every member — and `restoreSuggestion` takes it back.
	 */
	dismissSuggestion: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const refusal = await declineClaim(locals, viewer, await request.formData());
		if (refusal) return fail(refusal.status, { error: refusal.message });
		throw redirect(303, reviewPath(params.id));
	},

	/** Take a *no* back, so the claim is offered again on the next review (§6.5). */
	restoreSuggestion: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const refusal = await restoreClaim(locals, viewer, await request.formData());
		if (refusal) return fail(refusal.status, { error: refusal.message });
		throw redirect(303, reviewPath(params.id));
	},

	addNote: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const parsed = v.safeParse(AddNoteSchema, {
			body: form.get('body'),
			visibility: form.get('visibility') || undefined,
			isPinned: form.get('isPinned') === 'on'
		});
		if (!parsed.success) {
			return fail(400, { noteError: say(locals, 'errors.note.empty') });
		}

		// A note is a command (docs/04 §4.11.2): named by the form when it can, so a save whose
		// answer was lost and is then kept on the phone is recognised when it arrives again.
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'note.add',
			payload: { contactId: params.id, ...parsed.output },
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'note.add') {
			return fail(400, { noteError: say(locals, 'errors.command.malformed') });
		}
		const author = { userId: locals.user.id, householdId: locals.user.householdId };
		const outcome = await dispatchCommand(getCommandDeps(), author, command).catch(() => null);
		if (outcome?.status !== 'applied') {
			return fail(400, {
				noteError:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.note.couldNotSave')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	addField: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(AddFieldSchema, {
			kind: form.get('kind'),
			label: form.get('label') || undefined,
			value: form.get('value')
		});
		if (!parsed.success) {
			return fail(400, { fieldError: say(locals, 'errors.field.needKindAndValue') });
		}

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'field.add',
			payload: { contactId: params.id, ...parsed.output, label: parsed.output.label ?? null },
			issuedAt: systemClock.now()
		});
		const outcome = command
			? await dispatchCommand(getCommandDeps(), { userId: viewer.id, householdId: viewer.householdId }, command).catch(() => null)
			: null;
		if (outcome?.status !== 'applied') {
			return fail(400, {
				fieldError:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.field.couldNotAdd')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	addDate: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		// The date field posts `--MM-DD` itself when the year was left blank (docs/02 §2.13).
		const date = String(form.get('date') ?? '');
		const parsed = v.safeParse(AddDateSchema, {
			kind: form.get('kind'),
			label: form.get('label') || undefined,
			date,
			recursYearly: form.get('recursYearly') !== null,
			remind: form.get('remind') !== null
		});
		if (!parsed.success) {
			return fail(400, { dateError: say(locals, 'errors.date.needKindAndDay') });
		}

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'date.add',
			payload: { contactId: params.id, ...parsed.output, label: parsed.output.label ?? null },
			issuedAt: systemClock.now()
		});
		const outcome = command
			? await dispatchCommand(getCommandDeps(), { userId: viewer.id, householdId: viewer.householdId }, command).catch(() => null)
			: null;
		if (outcome?.status !== 'applied') {
			return fail(400, {
				dateError:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.date.couldNotAdd')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	logInteraction: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const parsed = v.safeParse(LogInteractionSchema, {
			kind: form.get('kind'),
			happenedAt: form.get('happenedAt'),
			title: form.get('title') || undefined,
			description: form.get('description') || undefined,
			visibility: form.get('visibility') || undefined,
			participantIds: form.getAll('participants').filter((p) => typeof p === 'string')
		});
		if (!parsed.success) {
			return fail(400, { interactionError: say(locals, 'errors.interaction.needKindAndDay') });
		}

		// A touchpoint is a command (docs/04 §4.11.2), named by the form when it can, so one
		// kept on the phone after a lost answer is recognised when it arrives again.
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'interaction.log',
			payload: {
				contactId: params.id,
				...parsed.output,
				title: parsed.output.title ?? null,
				description: parsed.output.description ?? null
			},
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'interaction.log') {
			return fail(400, { interactionError: say(locals, 'errors.interaction.needKindAndDay') });
		}
		const author = { userId: locals.user.id, householdId: locals.user.householdId };
		const outcome = await dispatchCommand(getCommandDeps(), author, command).catch(() => null);
		if (outcome?.status !== 'applied') {
			return fail(400, {
				interactionError:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.interaction.couldNotLog')
			});
		}

		// The story timeline owns its paged list, so the page reloads to show the new item — and
		// has to be told where it came from, or the reader lands back at the top.
		throw redirect(303, contactSectionPath(params.id, 'story'));
	},

	removeInteraction: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const interactionId = form.get('id');
		if (typeof interactionId !== 'string') return fail(400, {});

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const author = { userId: locals.user.id, householdId: locals.user.householdId, defaultVisibility: 'shared' as const };
		const removed = await deleteInteraction(getInteractionDeps(), author, interactionId);
		if (!removed) return fail(403, { interactionError: say(locals, 'errors.interaction.onlyLogger') });
		throw redirect(303, `/contacts/${params.id}`);
	},

	/*
	 * The story timeline shows journal entries beside touchpoints, so removing one has to be
	 * possible from here too — previously only the full journal page could.
	 */
	removeJournalEntry: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const id = form.get('id');
		if (typeof id !== 'string') return fail(400, {});

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			defaultVisibility: 'shared' as const
		};
		const removed = await deleteJournalEntry(getJournalDeps(), author, id);
		if (!removed) return fail(403, { interactionError: say(locals, 'errors.journal.onlyAuthor') });
		throw redirect(303, `/contacts/${params.id}`);
	},

	removeDate: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const dateId = form.get('dateId');
		if (typeof dateId !== 'string') return fail(400, {});

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		await getImportantDates().remove(params.id, dateId);
		throw redirect(303, `/contacts/${params.id}`);
	},

	removeField: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const fieldId = form.get('fieldId');
		if (typeof fieldId !== 'string') return fail(400, {});

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		await getContactFields().remove(params.id, fieldId);
		throw redirect(303, `/contacts/${params.id}`);
	},

	addTag: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const parsed = v.safeParse(AddTagSchema, {
			name: form.get('name'),
			color: form.get('color') || undefined
		});
		if (!parsed.success) return fail(400, { tagError: say(locals, 'errors.tag.needName') });

		// A command (docs/04 §4.11.2), named by the form so one kept on the phone is recognised.
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'tag.assign',
			payload: { contactId: params.id, name: parsed.output.name, color: parsed.output.color ?? null },
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'tag.assign') return fail(400, { tagError: say(locals, 'errors.tag.needName') });
		const author = { userId: locals.user.id, householdId: locals.user.householdId };
		const outcome = await dispatchCommand(getCommandDeps(), author, command).catch(() => null);
		if (outcome?.status !== 'applied') {
			return fail(400, {
				tagError:
					outcome?.status === 'refused' ? outcome.reason(translator(locals)) : say(locals, 'errors.tag.couldNotAdd')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	removeTag: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const tagId = form.get('tagId');
		if (typeof tagId !== 'string') return fail(400, {});

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		await unassignTag(getTagDeps(), locals.user.householdId, params.id, tagId);
		throw redirect(303, `/contacts/${params.id}`);
	},

	/** Add one or more photos to the gallery (docs/02 §2.14). */
	addGalleryPhotos: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const form = await request.formData();
		const images = form.getAll('image').filter((f): f is File => f instanceof File);
		const thumbs = form.getAll('thumb').filter((f): f is File => f instanceof File);
		const widths = form.getAll('width');
		const heights = form.getAll('height');
		if (images.length === 0 || images.length !== thumbs.length) {
			return fail(400, { photoError: say(locals, 'errors.image.chooseSome') });
		}
		const visibility = v.parse(VisibilitySchema, form.get('visibility') || undefined);

		// An upload is a command, and each photo one of its own following it (docs/04 §4.11.2).
		const author = { userId: viewer.id, householdId: viewer.householdId };
		const refusal = (outcome: Awaited<ReturnType<typeof dispatchCommand>> | null) =>
			fail(400, {
				photoError:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.image.couldNotStore')
			});
		const upload = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'gallery.add',
			payload: { contactId: params.id, visibility },
			issuedAt: systemClock.now()
		});
		const added = upload ? await dispatchCommand(getCommandDeps(), author, upload).catch(() => null) : null;
		if (!upload || added?.status !== 'applied') return refusal(added);
		for (const [index, image] of images.entries()) {
			const photo = parsePhotoCommand({
				id: ulidGenerator.next(),
				type: 'gallery.photo',
				parentId: upload.id,
				image: new Uint8Array(await image.arrayBuffer()),
				thumb: new Uint8Array(await thumbs[index]!.arrayBuffer()),
				width: Number(widths[index]),
				height: Number(heights[index]),
				issuedAt: systemClock.now()
			});
			const stored = photo ? await dispatchCommand(getCommandDeps(), author, photo).catch(() => null) : null;
			if (stored?.status !== 'applied') return refusal(stored);
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	/** Caption a gallery photo; blank clears it. Only its uploader may. */
	captionPhoto: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const form = await request.formData();
		const photoId = form.get('photoId');
		const caption = form.get('caption');
		if (typeof photoId !== 'string' || typeof caption !== 'string') {
			return fail(400, { photoError: say(locals, 'errors.caption.unreadable') });
		}
		try {
			if (!(await captionGalleryPhoto(getGalleryDeps(), viewer, photoId, caption))) {
				return fail(403, { photoError: say(locals, 'errors.photo.onlyOwnerCaption') });
			}
		} catch (err) {
			if (err instanceof CaptionTooLongError) return fail(400, { photoError: err.phrase(translator(locals)) });
			throw err;
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	/** Move a gallery photo between shared and private. Only its uploader may. */
	setPhotoVisibility: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const form = await request.formData();
		const parsed = v.safeParse(PhotoVisibilitySchema, {
			photoId: form.get('photoId'),
			visibility: form.get('visibility')
		});
		if (!parsed.success) return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		if (
			!(await setGalleryPhotoVisibility(
				getGalleryDeps(),
				viewer,
				parsed.output.photoId,
				parsed.output.visibility
			))
		) {
			return fail(403, { photoError: say(locals, 'errors.photo.onlyOwnerChange') });
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	/**
	 * Wear a gallery photo as this contact's avatar through the square chosen in the cropper
	 * (docs/02 §2.14). The browser sends the square and its rendering, as for a new avatar.
	 */
	framePhotoAsAvatar: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const form = await request.formData();
		const photoId = form.get('photoId');
		const image = form.get('image');
		const thumb = form.get('thumb');
		if (typeof photoId !== 'string' || !(image instanceof File) || !(thumb instanceof File)) {
			return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		}
		const crop = { x: Number(form.get('cropX')), y: Number(form.get('cropY')), size: Number(form.get('cropSize')) };
		const upload = {
			image: new Uint8Array(await image.arrayBuffer()),
			thumb: new Uint8Array(await thumb.arrayBuffer()),
			width: Number(form.get('width')),
			height: Number(form.get('height'))
		};
		try {
			if (!(await frameAsAvatar(getFramingDeps(), viewer, { contactId: params.id, photoId, crop, upload }))) {
				return fail(404, { photoError: say(locals, 'errors.photo.notFound') });
			}
		} catch (err) {
			if (err instanceof InvalidAvatarError) return fail(400, { photoError: err.phrase(translator(locals)) });
			throw err;
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	/** Delete a gallery photo and its files. Only its uploader may. */
	removePhoto: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const form = await request.formData();
		const photoId = form.get('photoId');
		if (typeof photoId !== 'string') return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		if (!(await removeGalleryPhoto(getGalleryDeps(), viewer, photoId))) {
			return fail(403, { photoError: say(locals, 'errors.photo.onlyOwnerRemove') });
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	setAvatar: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const form = await request.formData();
		const image = form.get('image');
		const thumb = form.get('thumb');
		if (!(image instanceof File) || !(thumb instanceof File)) {
			return fail(400, { avatarError: say(locals, 'errors.image.chooseOne') });
		}

		const upload = {
			image: new Uint8Array(await image.arrayBuffer()),
			thumb: new Uint8Array(await thumb.arrayBuffer()),
			width: Number(form.get('width')),
			height: Number(form.get('height'))
		};

		try {
			await setContactAvatar(
				getAvatarDeps(),
				{ userId: locals.user.id, householdId: locals.user.householdId },
				params.id,
				upload
			);
		} catch (err) {
			if (err instanceof InvalidAvatarError) return fail(400, { avatarError: err.phrase(translator(locals)) });
			return fail(400, { avatarError: say(locals, 'errors.image.couldNotSave') });
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	joinCircle: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const name = form.get('circleName');
		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { circleError: say(locals, 'errors.circle.needName') });
		}

		// A command (docs/04 §4.11.2), named by the form so one kept on the phone is recognised.
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'circle.join',
			payload: { contactId: params.id, circleName: name, role: form.get('role') ?? null },
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'circle.join') return fail(400, { circleError: say(locals, 'errors.circle.needName') });
		const author = { userId: locals.user.id, householdId: locals.user.householdId };
		const outcome = await dispatchCommand(getCommandDeps(), author, command).catch(() => null);
		if (outcome?.status !== 'applied') {
			return fail(400, {
				circleError:
					outcome?.status === 'refused' ? outcome.reason(translator(locals)) : say(locals, 'errors.circle.couldNotAdd')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	leaveCircle: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const form = await request.formData();
		const circleId = form.get('circleId');
		if (typeof circleId !== 'string') return fail(400, {});

		await removeMember(getCircleDeps(), circleId, params.id);
		throw redirect(303, `/contacts/${params.id}`);
	}
};
