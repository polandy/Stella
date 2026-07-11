import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getContact } from '$lib/server/domain/contacts/contacts';
import {
	deleteJournalEntry,
	listJournalForContact,
	saveJournalEntry
} from '$lib/server/domain/journal/journal';
import { renderMarkdown } from '$lib/server/domain/notes/markdown';
import { getContactDeps, getJournalDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/** Local calendar date as YYYY-MM-DD, for the compose form's default. */
function today(): string {
	return new Date().toLocaleDateString('en-CA'); // en-CA formats as ISO YYYY-MM-DD
}

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const contact = await getContact(getContactDeps(), viewer, params.id);
	if (!contact) throw error(404, 'Contact not found'); // never reveal existence

	const entries = await listJournalForContact(getJournalDeps(), viewer, params.id);

	return {
		contact: { id: contact.id, displayName: contact.displayName, avatarPhotoId: contact.avatarPhotoId },
		today: today(),
		// render Markdown server-side; the output is already safe (docs/02 §2.5)
		entries: entries.map((e) => ({
			id: e.id,
			entryDate: e.entryDate,
			title: e.title,
			bodyHtml: renderMarkdown(e.body),
			visibility: e.visibility,
			mine: e.createdBy === locals.user!.id,
			updatedAt: e.updatedAt
		}))
	};
};

const SaveSchema = v.object({
	entryDate: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Please pick a valid date.')),
	title: v.optional(v.pipe(v.string(), v.trim())),
	body: v.pipe(v.string(), v.trim(), v.minLength(1)),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared')
});

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		// The contact must be visible to journal about it.
		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, 'Contact not found');

		const form = await request.formData();
		const parsed = v.safeParse(SaveSchema, {
			entryDate: form.get('entryDate'),
			title: form.get('title') || undefined,
			body: form.get('body'),
			visibility: form.get('visibility') || undefined
		});
		if (!parsed.success) {
			return fail(400, {
				journalError: parsed.issues[0]?.message ?? 'Please write something before saving.'
			});
		}

		try {
			await saveJournalEntry(
				getJournalDeps(),
				{ userId: locals.user.id, householdId: locals.user.householdId, defaultVisibility: 'shared' },
				{
					contactId: params.id,
					entryDate: parsed.output.entryDate,
					title: parsed.output.title ?? null,
					body: parsed.output.body,
					visibility: parsed.output.visibility
				}
			);
		} catch (err) {
			return fail(400, { journalError: err instanceof Error ? err.message : 'Could not save the entry.' });
		}

		throw redirect(303, `/contacts/${params.id}/journal`);
	},

	delete: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const id = form.get('id');
		if (typeof id !== 'string') return fail(400, {});

		await deleteJournalEntry(
			getJournalDeps(),
			{ userId: locals.user.id, householdId: locals.user.householdId, defaultVisibility: 'shared' },
			id
		);
		throw redirect(303, `/contacts/${params.id}/journal`);
	}
};
