import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth/guards';
import {
	addContactField,
	CONTACT_FIELD_KINDS,
	fieldHref,
	listContactFields
} from '$lib/server/domain/contact-fields/contact-fields';
import {
	joinCircleByName,
	listCircles,
	listCirclesForContact,
	removeMember
} from '$lib/server/domain/circles/circles';
import {
	archiveContact,
	deleteContact,
	mergeContacts,
	editProfile,
	EmptyContactNameError,
	getContact,
	listContactNames,
	listContacts,
	restoreContact
} from '$lib/server/domain/contacts/contacts';
import {
	addImportantDate,
	InvalidImportantDateError,
	listImportantDates,
	overridesDerivedBirthday
} from '$lib/server/domain/dates/important-dates';
import { withoutYear } from '$lib/dates/labels';
import { IMPORTANT_DATE_KINDS } from '$lib/server/domain/dates/upcoming';
import {
	deleteInteraction,
	INTERACTION_KINDS,
	InvalidInteractionError,
	lastContactedAt,
	listInteractions,
	logInteraction
} from '$lib/server/domain/interactions/interactions';
import { deleteJournalEntry } from '$lib/server/domain/journal/journal';
import { authorNames } from '$lib/server/domain/household/members';
import { listStoryPage } from '$lib/server/domain/story/story';
import { authorLabel } from '$lib/story/author';
import { toStoryItem } from './story-view';
import { InvalidAvatarError, setContactAvatar } from '$lib/server/domain/media/avatars';
import {
	captionGalleryPhoto,
	CaptionTooLongError,
	listGallery,
	removeGalleryPhoto,
	setGalleryPhotoVisibility,
	useAsAvatar
} from '$lib/server/domain/media/gallery';
import { addGalleryPhoto } from '$lib/server/domain/media/gallery-upload';
import { InvalidImageError } from '$lib/server/domain/media/journal-photos';
import { createHandleResolver, mentionsOtherThan, resolveMentions } from '$lib/mentions/mentions';
import { mentionSnippet } from '$lib/mentions/snippet';
import { TAB_FOR_REFERENCE } from '$lib/contacts/tabs';
import { listMentionedIn } from '$lib/server/domain/mentions/mentioned-in';
import { audienceCandidates } from '$lib/server/domain/moments/moments';
import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import { createNote, listNotesForContact, setNoteMentions } from '$lib/server/domain/notes/notes';
import {
	createRelationship,
	DuplicateRelationshipError,
	editRelationshipDetails,
	InvalidRelationshipDetailsError,
	removeRelationship,
	readKinship
} from '$lib/server/domain/relationships/relationships';
import {
	assignTagByName,
	listTagsForContact,
	TAG_COLORS,
	unassignTag
} from '$lib/server/domain/tags/tags';
import {
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
	getGalleryUploadDeps,
	getPhotos,
	getRelationshipDeps,
	getDeleteContactDeps,
	getRelationships,
	getRelationshipTypes,
	getStoryDeps,
	getTagDeps,
	getMemberDeps,
	getMentionedInDeps
} from '$lib/server/services';

/*
 * `?propose=<a>:<b>` names the pair whose new link should be propagated (docs/02 §2.4.1).
 * The pair is only a pointer: the use-case reads the real link back from the visible graph,
 * so a hand-written value can never conjure a suggestion out of nothing.
 */
const PROPOSE_SEPARATOR = ':';

function parseProposePair(raw: string | null): { a: string; b: string } | null {
	const [a, b] = (raw ?? '').split(PROPOSE_SEPARATOR);
	return a && b ? { a, b } : null;
}

/** Whether a birth date precision (docs/03 §3.4) names an actual day rather than a year. */
const namesADay = (precision: string) => precision === 'full' || precision === 'month_day';

/** First page of the story timeline; older items stream in via the story endpoint. */
const STORY_PAGE = 12;
import type { Actions, PageServerLoad } from './$types';
import { say, translator } from '$lib/server/i18n/say';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const contact = await getContact(getContactDeps(), viewer, params.id);
	if (!contact) {
		// 404 for both "missing" and "not visible to you" — never reveal existence.
		throw error(404, say(locals, 'errors.contact.notFound'));
	}

	const [
		relationships,
		types,
		allContacts,
		contactNames,
		notes,
		fields,
		tags,
		contactCircles,
		allCircles,
		storyPage,
		journalPhotos,
		gallery,
		dates,
		interactions,
		kinship,
		mentionedIn
	] = await Promise.all([
		getRelationships().listForContactVisibleTo(viewer, params.id),
		getRelationshipTypes().listTypes(viewer),
		listContacts(getContactDeps(), viewer),
		listContactNames(getContactDeps(), viewer),
		listNotesForContact(getNoteDeps(), viewer, params.id),
		listContactFields(getContactFieldDeps(), viewer, params.id),
		listTagsForContact(getTagDeps(), viewer, params.id),
		listCirclesForContact(getCircleDeps(), viewer, params.id),
		listCircles(getCircleDeps(), viewer),
		listStoryPage(getStoryDeps(), viewer, params.id, { limit: STORY_PAGE }),
		getPhotos().listJournalPhotos(viewer, params.id),
		listGallery(getGalleryDeps(), viewer, params.id),
		listImportantDates(getImportantDateDeps(), viewer, params.id),
		listInteractions(getInteractionDeps(), viewer, params.id),
		readKinship(getRelationshipDeps(), viewer, params.id, parseProposePair(url.searchParams.get('propose'))),
		listMentionedIn(getMentionedInDeps(), viewer, params.id)
	]);

	// Group visible journal photo ids by entry so the story timeline renders each gallery.
	const journalPhotosByEntry = new Map<string, string[]>();
	for (const p of journalPhotos) {
		const list = journalPhotosByEntry.get(p.journalEntryId) ?? [];
		list.push(p.id);
		journalPhotosByEntry.set(p.journalEntryId, list);
	}

	// Name lookup for @-mention chips in journal bodies, scoped to what the viewer may see.
	// Archived people are out of `allContacts`, but a mention already written still names
	// them — so the chip lookup reads the visibility scope (docs/02 §2.2).
	const nameById = new Map(contactNames.map((c) => [c.id, c.displayName]));
	const nameOf = (id: string) => nameById.get(id) ?? null;
	// …and for the member behind each item (docs/02 §2.23).
	const nameOfAuthor = await authorNames(getMemberDeps(), viewer.householdId);

	return {
		story: {
			items: storyPage.items.map((item) =>
				toStoryItem(item, {
					userId: locals.user!.id,
					photosByEntry: journalPhotosByEntry,
					nameOf,
					nameOfAuthor
				})
			),
			nextCursor: storyPage.nextCursor
		},
		contact,
		interactions: interactions.map((i) => ({
			id: i.id,
			kind: i.kind,
			happenedAt: i.happenedAt,
			title: i.title,
			description: i.description,
			visibility: i.visibility,
			mine: i.createdBy === locals.user!.id,
			participants: i.participants.map((p) => ({ contactId: p.contactId, displayName: p.displayName }))
		})),
		// Derived from the list *this viewer* sees, so a private touchpoint never shows here.
		lastContactedAt: lastContactedAt(interactions),
		interactionKinds: INTERACTION_KINDS,
		// Deleting a person for good is admin-only (docs/02 §2.2); archiving is for everyone.
		isAdmin: locals.user.role === 'admin',
		dates,
		// The birthday derived from the profile, unless an explicit row takes over (§2.13.2) or
		// the birth date is only an estimated year (docs/03 §3.4), which names no day.
		derivedBirthday:
			overridesDerivedBirthday(dates) || !namesADay(contact.birthDatePrecision)
				? null
				: contact.birthDate,
		estimatedBirthYear: namesADay(contact.birthDatePrecision) ? null : contact.birthDate,
		dateKinds: IMPORTANT_DATE_KINDS,
		relationships,
		// Inferred, never stored (docs/02 §2.4.1); shown apart from the entered links.
		derivedKin: kinship.derived,
		// Links implied by the one just added, offered for a single confirmation each.
		proposals: kinship.proposals,
		proposeFor: url.searchParams.get('propose'),
		relationshipTypes: types,
		tags,
		circles: contactCircles,
		circleNames: allCircles.map((c) => c.name),
		tagColors: TAG_COLORS,
		fieldKinds: CONTACT_FIELD_KINDS,
		fields: fields.map((f) => ({
			id: f.id,
			kind: f.kind,
			label: f.label,
			value: f.value,
			href: fieldHref(f.kind, f.value)
		})),
		// candidate targets for a new relationship: everyone visible except this contact
		otherContacts: allContacts.filter((c) => c.id !== params.id),
		// `?relate=<id>` pre-selects a person in the relationship form (the stream's link hint, §2.22.1).
		relateTo: url.searchParams.get('relate'),
		// The person's photo gallery (docs/02 §2.14), newest first, already visibility-scoped.
		gallery,
		// Who is looking: the gallery only offers caption/remove on your own photos.
		viewerId: viewer.id,
		// Which tab to open on. A form action redirects back with it, so acting on a photo
		// does not throw the reader back to the story.
		tab: url.searchParams.get('tab'),
		/*
		 * Where this person is named by somebody else (docs/02 §2.20.1). Read-only: the entry
		 * belongs to the person it is about, so each item links there rather than offering an
		 * edit that would have to be undone on another page.
		 */
		mentionedIn: mentionedIn.map((reference) => ({
			kind: reference.kind,
			entryId: reference.entryId,
			sourceName: reference.sourceName,
			author: authorLabel(reference.authorId === locals.user!.id, nameOfAuthor(reference.authorId)),
			visibility: reference.visibility,
			day: reference.day,
			title: reference.title,
			snippet: mentionSnippet(reference.body, nameOf),
			href: `/contacts/${reference.sourceContactId}?tab=${TAB_FOR_REFERENCE[reference.kind]}`
		})),
		// render Markdown + @-mentions server-side; the output is already safe (docs/02 §2.5)
		notes: notes.map((note) => ({
			id: note.id,
			title: note.title,
			bodyHtml: renderMarkdownWithMentions(note.body, nameOf),
			isPinned: note.isPinned,
			visibility: note.visibility,
			createdAt: note.createdAt
		}))
	};
};

const EditProfileSchema = v.object({
	displayName: v.pipe(v.string(), v.trim(), v.minLength(1)),
	description: v.optional(v.pipe(v.string(), v.trim()))
});

/** The specifics of a link (docs/02 §2.4); the domain has the last word on what is real. */
const RelationshipDetailsSchema = {
	description: v.optional(v.pipe(v.string(), v.trim())),
	sinceDate: v.optional(v.pipe(v.string(), v.trim())),
	status: v.optional(v.pipe(v.string(), v.trim()))
};

const AddRelationshipSchema = v.object({
	targetId: v.pipe(v.string(), v.minLength(1)),
	typeId: v.pipe(v.string(), v.minLength(1)),
	...RelationshipDetailsSchema
});

const EditRelationshipSchema = v.object({
	relationshipId: v.pipe(v.string(), v.minLength(1)),
	...RelationshipDetailsSchema
});

/** Visibility of a newly uploaded gallery photo (docs/02 §2.14). */
const VisibilitySchema = v.optional(v.picklist(['shared', 'private']), 'shared');

const PhotoVisibilitySchema = v.object({
	photoId: v.pipe(v.string(), v.minLength(1)),
	visibility: v.picklist(['shared', 'private'])
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

	restore: async ({ params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const done = await restoreContact(getContactDeps(), viewer, params.id);
		if (!done) throw error(404, say(locals, 'errors.contact.notFound'));
		throw redirect(303, `/contacts/${params.id}`);
	},

	addRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(AddRelationshipSchema, {
			targetId: form.get('targetId'),
			typeId: form.get('typeId'),
			description: form.get('description') || undefined,
			sinceDate: form.get('sinceDate') || undefined,
			status: form.get('status') || undefined
		});
		if (!parsed.success) {
			return fail(400, { error: say(locals, 'errors.relationship.needPersonAndType') });
		}

		// Both endpoints must be visible to the viewer.
		const [self, target] = await Promise.all([
			getContact(getContactDeps(), viewer, params.id),
			getContact(getContactDeps(), viewer, parsed.output.targetId)
		]);
		if (!self || !target) {
			return fail(400, { error: say(locals, 'errors.person.notFound') });
		}

		try {
			await createRelationship(getRelationshipDeps(), viewer, {
				fromContactId: params.id,
				toContactId: parsed.output.targetId,
				typeId: parsed.output.typeId,
				description: parsed.output.description ?? null,
				sinceDate: parsed.output.sinceDate ?? null,
				status: parsed.output.status ?? null
			});
		} catch (err) {
			if (err instanceof DuplicateRelationshipError) {
				return fail(409, { error: say(locals, 'errors.relationship.duplicate') });
			}
			if (err instanceof InvalidRelationshipDetailsError) {
				return fail(400, { error: err.phrase(translator(locals)) });
			}
			return fail(400, { error: say(locals, 'errors.relationship.couldNotAdd') });
		}

		// Come back with the new pair named, so its implied links can be offered.
		const pair = [params.id, parsed.output.targetId].join(PROPOSE_SEPARATOR);
		throw redirect(303, `/contacts/${params.id}?propose=${pair}#relationships`);
	},

	/** Correct the specifics of a link. The type is not editable (docs/02 §2.4). */
	editRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(EditRelationshipSchema, {
			relationshipId: form.get('relationshipId'),
			description: form.get('description') || undefined,
			sinceDate: form.get('sinceDate') || undefined,
			status: form.get('status') || undefined
		});
		if (!parsed.success) return fail(400, { error: say(locals, 'errors.relationship.couldNotSave') });

		try {
			const saved = await editRelationshipDetails(
				getRelationshipDeps(),
				viewer,
				parsed.output.relationshipId,
				parsed.output
			);
			if (!saved) return fail(404, { error: say(locals, 'errors.relationship.notFound') });
		} catch (err) {
			if (err instanceof InvalidRelationshipDetailsError) {
				return fail(400, { error: err.phrase(translator(locals)) });
			}
			throw err;
		}

		throw redirect(303, `/contacts/${params.id}?tab=people`);
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
		throw redirect(303, `/contacts/${params.id}?tab=people`);
	},

	/**
	 * Store one propagation suggestion (docs/02 §2.4.1). Both endpoints are checked against
	 * the viewer, and the pair is carried on so the remaining suggestions stay on screen.
	 */
	addProposedRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(AddProposedSchema, {
			fromId: form.get('fromId'),
			toId: form.get('toId'),
			typeId: form.get('typeId'),
			propose: form.get('propose') || undefined
		});
		if (!parsed.success) return fail(400, { error: say(locals, 'errors.relationship.badSuggestion') });

		const [from, to] = await Promise.all([
			getContact(getContactDeps(), viewer, parsed.output.fromId),
			getContact(getContactDeps(), viewer, parsed.output.toId)
		]);
		if (!from || !to) return fail(400, { error: say(locals, 'errors.person.notFound') });

		try {
			await createRelationship(getRelationshipDeps(), viewer, {
				fromContactId: parsed.output.fromId,
				toContactId: parsed.output.toId,
				typeId: parsed.output.typeId,
				description: null
			});
		} catch (err) {
			if (!(err instanceof DuplicateRelationshipError)) {
				return fail(400, { error: say(locals, 'errors.relationship.couldNotAdd') });
			}
		}

		const back = parsed.output.propose ? `?propose=${parsed.output.propose}` : '';
		throw redirect(303, `/contacts/${params.id}${back}#relationships`);
	},

	addNote: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(AddNoteSchema, {
			body: form.get('body'),
			visibility: form.get('visibility') || undefined,
			isPinned: form.get('isPinned') === 'on'
		});
		if (!parsed.success) {
			return fail(400, { noteError: say(locals, 'errors.note.empty') });
		}

		// The contact must be visible to add a note to it.
		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const creator = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			defaultVisibility: 'shared' as const // TODO: user default (settings, §2.16)
		};
		// Resolve @-mentions against the contacts allowed for this note's audience, so the stored
		// body carries stable id-based tokens and we know who to link (docs/02 §2.20.1).
		const resolver = createHandleResolver(
			audienceCandidates(await listContacts(getContactDeps(), viewer), parsed.output.visibility)
		);
		const resolved = resolveMentions(parsed.output.body, resolver);

		let noteId: string;
		try {
			noteId = await createNote(getNoteDeps(), creator, {
				contactId: params.id,
				body: resolved.body,
				visibility: parsed.output.visibility,
				isPinned: parsed.output.isPinned
			});
		} catch {
			return fail(400, { noteError: say(locals, 'errors.note.couldNotSave') });
		}

		// Persist the reverse links, dropping a reference to the person whose note this is:
		// a note on Sandra that names Sandra is not a passive mention (docs/02 §2.20.1).
		await setNoteMentions(getNoteDeps(), noteId, mentionsOtherThan(resolved.ids, params.id));

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

		try {
			await addContactField(getContactFieldDeps(), {
				contactId: params.id,
				kind: parsed.output.kind,
				label: parsed.output.label ?? null,
				value: parsed.output.value
			});
		} catch {
			return fail(400, { fieldError: say(locals, 'errors.field.couldNotAdd') });
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	addDate: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		// `<input type="date">` always yields a year; "Year unknown" drops it to `--MM-DD`.
		const raw = String(form.get('date') ?? '');
		const date = form.get('yearUnknown') !== null ? withoutYear(raw) : raw;
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

		try {
			await addImportantDate(getImportantDateDeps(), {
				contactId: params.id,
				kind: parsed.output.kind,
				label: parsed.output.label ?? null,
				date: parsed.output.date,
				recursYearly: parsed.output.recursYearly,
				remind: parsed.output.remind
			});
		} catch (err) {
			return fail(400, {
				dateError:
					err instanceof InvalidImportantDateError ? err.phrase(translator(locals)) : say(locals, 'errors.date.couldNotAdd')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	logInteraction: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

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

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		// A participant must be someone the viewer may see; an unknown id is refused rather
		// than stored, so nothing outside the viewer's view ever gets attached.
		const visibleIds = new Set((await listContacts(getContactDeps(), viewer)).map((c) => c.id));
		if (!parsed.output.participantIds.every((id) => visibleIds.has(id))) {
			return fail(400, { interactionError: say(locals, 'errors.interaction.participantNotFound') });
		}

		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			defaultVisibility: 'shared' as const // TODO: user default (settings, §2.16)
		};
		try {
			await logInteraction(getInteractionDeps(), author, {
				contactId: params.id,
				kind: parsed.output.kind,
				happenedAt: parsed.output.happenedAt,
				title: parsed.output.title ?? null,
				description: parsed.output.description ?? null,
				visibility: parsed.output.visibility,
				participantIds: parsed.output.participantIds
			});
		} catch (err) {
			return fail(400, {
				interactionError:
					err instanceof InvalidInteractionError ? err.phrase(translator(locals)) : say(locals, 'errors.interaction.couldNotLog')
			});
		}

		// `?tab=story`: this form posts natively (see the comment on the story panel in
		// +page.svelte), so the reload that follows has to be told which tab held it — People
		// is the page's default now, and a touchpoint is logged from Story.
		throw redirect(303, `/contacts/${params.id}?tab=story`);
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
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(AddTagSchema, {
			name: form.get('name'),
			color: form.get('color') || undefined
		});
		if (!parsed.success) return fail(400, { tagError: say(locals, 'errors.tag.needName') });

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		try {
			await assignTagByName(
				getTagDeps(),
				locals.user.householdId,
				params.id,
				parsed.output.name,
				parsed.output.color
			);
		} catch {
			return fail(400, { tagError: say(locals, 'errors.tag.couldNotAdd') });
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

		await unassignTag(getTagDeps(), params.id, tagId);
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

		try {
			for (const [index, image] of images.entries()) {
				await addGalleryPhoto(
					getGalleryUploadDeps(),
					{ userId: locals.user.id, householdId: locals.user.householdId },
					{
						contactId: params.id,
						visibility,
						upload: {
							image: new Uint8Array(await image.arrayBuffer()),
							thumb: new Uint8Array(await thumbs[index]!.arrayBuffer()),
							width: Number(widths[index]),
							height: Number(heights[index])
						}
					}
				);
			}
		} catch (err) {
			return fail(400, {
				photoError: err instanceof InvalidImageError ? err.phrase(translator(locals)) : say(locals, 'errors.image.couldNotStore')
			});
		}
		throw redirect(303, `/contacts/${params.id}?tab=photos`);
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
		throw redirect(303, `/contacts/${params.id}?tab=photos`);
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
		throw redirect(303, `/contacts/${params.id}?tab=photos`);
	},

	/** Wear a gallery photo as this contact's avatar. */
	usePhotoAsAvatar: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const form = await request.formData();
		const photoId = form.get('photoId');
		if (typeof photoId !== 'string') return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		if (!(await useAsAvatar(getGalleryDeps(), viewer, params.id, photoId))) {
			return fail(404, { photoError: say(locals, 'errors.photo.notFound') });
		}
		throw redirect(303, `/contacts/${params.id}?tab=photos`);
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
		throw redirect(303, `/contacts/${params.id}?tab=photos`);
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
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const form = await request.formData();
		const name = form.get('circleName');
		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { circleError: say(locals, 'errors.circle.needName') });
		}

		try {
			await joinCircleByName(
				getCircleDeps(),
				{ userId: locals.user.id, householdId: locals.user.householdId, defaultVisibility: 'shared' },
				params.id,
				name,
				typeof form.get('role') === 'string' ? String(form.get('role')) : undefined
			);
		} catch {
			return fail(400, { circleError: say(locals, 'errors.circle.couldNotAdd') });
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
