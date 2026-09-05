import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
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
import { getContact, listContacts } from '$lib/server/domain/contacts/contacts';
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
import { listStoryPage } from '$lib/server/domain/story/story';
import { toStoryItem } from './story-view';
import { InvalidAvatarError, setContactAvatar } from '$lib/server/domain/media/avatars';
import { renderMarkdown } from '$lib/server/domain/notes/markdown';
import { createNote, listNotesForContact } from '$lib/server/domain/notes/notes';
import {
	createRelationship,
	DuplicateRelationshipError
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
	getPhotos,
	getRelationshipDeps,
	getRelationships,
	getStoryDeps,
	getTagDeps
} from '$lib/server/services';

/** Whether a birth date precision (docs/03 §3.4) names an actual day rather than a year. */
const namesADay = (precision: string) => precision === 'full' || precision === 'month_day';

/** First page of the story timeline; older items stream in via the story endpoint. */
const STORY_PAGE = 12;
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const contact = await getContact(getContactDeps(), viewer, params.id);
	if (!contact) {
		// 404 for both "missing" and "not visible to you" — never reveal existence.
		throw error(404, 'Contact not found');
	}

	const [
		relationships,
		types,
		allContacts,
		notes,
		fields,
		tags,
		contactCircles,
		allCircles,
		storyPage,
		journalPhotos,
		dates,
		interactions
	] = await Promise.all([
		getRelationships().listForContactVisibleTo(viewer, params.id),
		getRelationships().listTypes(),
		listContacts(getContactDeps(), viewer),
		listNotesForContact(getNoteDeps(), viewer, params.id),
		listContactFields(getContactFieldDeps(), viewer, params.id),
		listTagsForContact(getTagDeps(), viewer, params.id),
		listCirclesForContact(getCircleDeps(), viewer, params.id),
		listCircles(getCircleDeps(), viewer),
		listStoryPage(getStoryDeps(), viewer, params.id, { limit: STORY_PAGE }),
		getPhotos().listJournalPhotos(viewer, params.id),
		listImportantDates(getImportantDateDeps(), viewer, params.id),
		listInteractions(getInteractionDeps(), viewer, params.id)
	]);

	// Group visible journal photo ids by entry so the story timeline renders each gallery.
	const journalPhotosByEntry = new Map<string, string[]>();
	for (const p of journalPhotos) {
		const list = journalPhotosByEntry.get(p.journalEntryId) ?? [];
		list.push(p.id);
		journalPhotosByEntry.set(p.journalEntryId, list);
	}

	// Name lookup for @-mention chips in journal bodies, scoped to what the viewer may see.
	const nameById = new Map(allContacts.map((c) => [c.id, c.displayName]));
	const nameOf = (id: string) => nameById.get(id) ?? null;

	return {
		story: {
			items: storyPage.items.map((item) =>
				toStoryItem(item, {
					userId: locals.user!.id,
					photosByEntry: journalPhotosByEntry,
					nameOf
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
		// render Markdown server-side; the output is already safe (docs/02 §2.5)
		notes: notes.map((note) => ({
			id: note.id,
			title: note.title,
			bodyHtml: renderMarkdown(note.body),
			isPinned: note.isPinned,
			visibility: note.visibility,
			createdAt: note.createdAt
		}))
	};
};

const AddRelationshipSchema = v.object({
	targetId: v.pipe(v.string(), v.minLength(1)),
	typeId: v.pipe(v.string(), v.minLength(1)),
	description: v.optional(v.pipe(v.string(), v.trim()))
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
	addRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(AddRelationshipSchema, {
			targetId: form.get('targetId'),
			typeId: form.get('typeId'),
			description: form.get('description') || undefined
		});
		if (!parsed.success) {
			return fail(400, { error: 'Please choose a person and a relationship type.' });
		}

		// Both endpoints must be visible to the viewer.
		const [self, target] = await Promise.all([
			getContact(getContactDeps(), viewer, params.id),
			getContact(getContactDeps(), viewer, parsed.output.targetId)
		]);
		if (!self || !target) {
			return fail(400, { error: 'That person could not be found.' });
		}

		try {
			await createRelationship(getRelationshipDeps(), locals.user.householdId, locals.user.id, {
				fromContactId: params.id,
				toContactId: parsed.output.targetId,
				typeId: parsed.output.typeId,
				description: parsed.output.description ?? null
			});
		} catch (err) {
			if (err instanceof DuplicateRelationshipError) {
				return fail(409, { error: 'That relationship already exists.' });
			}
			return fail(400, { error: 'Could not add the relationship.' });
		}

		throw redirect(303, `/contacts/${params.id}`);
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
			return fail(400, { noteError: 'Please write something before saving.' });
		}

		// The contact must be visible to add a note to it.
		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, 'Contact not found');

		const creator = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			defaultVisibility: 'shared' as const // TODO: user default (settings, §2.16)
		};
		try {
			await createNote(getNoteDeps(), creator, {
				contactId: params.id,
				body: parsed.output.body,
				visibility: parsed.output.visibility,
				isPinned: parsed.output.isPinned
			});
		} catch {
			return fail(400, { noteError: 'Could not save the note.' });
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
			return fail(400, { fieldError: 'Please choose a type and enter a value.' });
		}

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, 'Contact not found');

		try {
			await addContactField(getContactFieldDeps(), {
				contactId: params.id,
				kind: parsed.output.kind,
				label: parsed.output.label ?? null,
				value: parsed.output.value
			});
		} catch {
			return fail(400, { fieldError: 'Could not add the field.' });
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
			return fail(400, { dateError: 'Please choose a kind and a day.' });
		}

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, 'Contact not found');

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
					err instanceof InvalidImportantDateError ? err.message : 'Could not add the date.'
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
			return fail(400, { interactionError: 'Please choose what happened and on which day.' });
		}

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, 'Contact not found');

		// A participant must be someone the viewer may see; an unknown id is refused rather
		// than stored, so nothing outside the viewer's view ever gets attached.
		const visibleIds = new Set((await listContacts(getContactDeps(), viewer)).map((c) => c.id));
		if (!parsed.output.participantIds.every((id) => visibleIds.has(id))) {
			return fail(400, { interactionError: 'One of the participants could not be found.' });
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
					err instanceof InvalidInteractionError ? err.message : 'Could not log the interaction.'
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	removeInteraction: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const interactionId = form.get('id');
		if (typeof interactionId !== 'string') return fail(400, {});

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, 'Contact not found');

		const author = { userId: locals.user.id, householdId: locals.user.householdId, defaultVisibility: 'shared' as const };
		const removed = await deleteInteraction(getInteractionDeps(), author, interactionId);
		if (!removed) return fail(403, { interactionError: 'Only the person who logged it can remove it.' });
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
		if (!contact) throw error(404, 'Contact not found');

		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			defaultVisibility: 'shared' as const
		};
		const removed = await deleteJournalEntry(getJournalDeps(), author, id);
		if (!removed) return fail(403, { interactionError: 'Only the person who wrote it can remove it.' });
		throw redirect(303, `/contacts/${params.id}`);
	},

	removeDate: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const dateId = form.get('dateId');
		if (typeof dateId !== 'string') return fail(400, {});

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, 'Contact not found');

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
		if (!contact) throw error(404, 'Contact not found');

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
		if (!parsed.success) return fail(400, { tagError: 'Please enter a tag name.' });

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, 'Contact not found');

		try {
			await assignTagByName(
				getTagDeps(),
				locals.user.householdId,
				params.id,
				parsed.output.name,
				parsed.output.color
			);
		} catch {
			return fail(400, { tagError: 'Could not add the tag.' });
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
		if (!contact) throw error(404, 'Contact not found');

		await unassignTag(getTagDeps(), params.id, tagId);
		throw redirect(303, `/contacts/${params.id}`);
	},

	setAvatar: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, 'Contact not found');

		const form = await request.formData();
		const image = form.get('image');
		const thumb = form.get('thumb');
		if (!(image instanceof File) || !(thumb instanceof File)) {
			return fail(400, { avatarError: 'Please choose an image.' });
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
			if (err instanceof InvalidAvatarError) return fail(400, { avatarError: err.message });
			return fail(400, { avatarError: 'Could not save the photo.' });
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	joinCircle: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, 'Contact not found');

		const form = await request.formData();
		const name = form.get('circleName');
		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { circleError: 'Please enter a circle name.' });
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
			return fail(400, { circleError: 'Could not add the circle.' });
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	leaveCircle: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, 'Contact not found');

		const form = await request.formData();
		const circleId = form.get('circleId');
		if (typeof circleId !== 'string') return fail(400, {});

		await removeMember(getCircleDeps(), circleId, params.id);
		throw redirect(303, `/contacts/${params.id}`);
	}
};
