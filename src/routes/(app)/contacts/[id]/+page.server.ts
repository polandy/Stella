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
import { listJournalPage } from '$lib/server/domain/journal/journal';
import { InvalidAvatarError, setContactAvatar } from '$lib/server/domain/media/avatars';
import { renderMarkdown, renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
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
	getJournalDeps,
	getNoteDeps,
	getPhotos,
	getRelationshipDeps,
	getRelationships,
	getTagDeps
} from '$lib/server/services';

/** First page of the inline journal timeline; older weeks stream in via the entries endpoint. */
const JOURNAL_PAGE = 8;
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
		journalPage,
		journalPhotos,
		dates
	] = await Promise.all([
		getRelationships().listForContactVisibleTo(viewer, params.id),
		getRelationships().listTypes(),
		listContacts(getContactDeps(), viewer),
		listNotesForContact(getNoteDeps(), viewer, params.id),
		listContactFields(getContactFieldDeps(), viewer, params.id),
		listTagsForContact(getTagDeps(), viewer, params.id),
		listCirclesForContact(getCircleDeps(), viewer, params.id),
		listCircles(getCircleDeps(), viewer),
		listJournalPage(getJournalDeps(), viewer, params.id, { limit: JOURNAL_PAGE }),
		getPhotos().listJournalPhotos(viewer, params.id),
		listImportantDates(getImportantDateDeps(), viewer, params.id)
	]);

	// Group visible journal photo ids by entry so the inline timeline renders each gallery.
	const journalPhotosByEntry = new Map<string, string[]>();
	for (const p of journalPhotos) {
		const list = journalPhotosByEntry.get(p.journalEntryId) ?? [];
		list.push(p.id);
		journalPhotosByEntry.set(p.journalEntryId, list);
	}

	// Name lookup for @-mention chips in journal bodies, scoped to what the viewer may see.
	const journalNameById = new Map(allContacts.map((c) => [c.id, c.displayName]));
	const journalNameOf = (id: string) => journalNameById.get(id) ?? null;

	return {
		journal: {
			entries: journalPage.entries.map((e) => ({
				id: e.id,
				entryDate: e.entryDate,
				title: e.title,
				bodyHtml: renderMarkdownWithMentions(e.body, journalNameOf),
				visibility: e.visibility,
				mine: e.createdBy === locals.user!.id,
				photos: journalPhotosByEntry.get(e.id) ?? []
			})),
			nextCursor: journalPage.nextCursor
		},
		contact,
		dates,
		// The birthday derived from the profile, unless an explicit row takes over (§2.13.2).
		derivedBirthday: overridesDerivedBirthday(dates) ? null : contact.birthDate,
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
