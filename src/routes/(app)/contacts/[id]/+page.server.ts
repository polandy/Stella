import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getContact, listContacts } from '$lib/server/domain/contacts/contacts';
import { renderMarkdown } from '$lib/server/domain/notes/markdown';
import { createNote, listNotesForContact } from '$lib/server/domain/notes/notes';
import {
	createRelationship,
	DuplicateRelationshipError
} from '$lib/server/domain/relationships/relationships';
import {
	getContactDeps,
	getNoteDeps,
	getRelationshipDeps,
	getRelationships
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

	const [relationships, types, allContacts, notes] = await Promise.all([
		getRelationships().listForContactVisibleTo(viewer, params.id),
		getRelationships().listTypes(),
		listContacts(getContactDeps(), viewer),
		listNotesForContact(getNoteDeps(), viewer, params.id)
	]);

	return {
		contact,
		relationships,
		relationshipTypes: types,
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
	}
};
