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
	getNoteDeps,
	getRelationshipDeps,
	getRelationships,
	getTagDeps
} from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const contact = await getContact(getContactDeps(), viewer, params.id);
	if (!contact) {
		// 404 for both "missing" and "not visible to you" — never reveal existence.
		throw error(404, 'Contact not found');
	}

	const [relationships, types, allContacts, notes, fields, tags, contactCircles, allCircles] =
		await Promise.all([
			getRelationships().listForContactVisibleTo(viewer, params.id),
			getRelationships().listTypes(),
			listContacts(getContactDeps(), viewer),
			listNotesForContact(getNoteDeps(), viewer, params.id),
			listContactFields(getContactFieldDeps(), viewer, params.id),
			listTagsForContact(getTagDeps(), viewer, params.id),
			listCirclesForContact(getCircleDeps(), viewer, params.id),
			listCircles(getCircleDeps(), viewer)
		]);

	return {
		contact,
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
