import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { requireAdmin, requireUser, requireViewer } from '$lib/server/auth/guards';
import {
	archiveContact,
	deleteContact,
	mergeContacts,
	restoreContact
} from '$lib/server/domain/contacts/contacts';
import { pruneOrphanTags } from '$lib/server/domain/tags/tags';
import { getTagDeps } from '$lib/server/services';
import { setSelfContact, UnknownSelfContactError } from '$lib/server/domain/household/self-contact';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/** The record itself, from the foot of the profile card (docs/02 §2.2, §2.1.3). */
export const recordActions = {
	/*
	 * Merging a duplicate into this person (docs/02 §2.2). Admin only for the same reason as
	 * deleting: it ends a record, and there is no way back.
	 */
	merge: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const viewer = requireViewer(locals);
		const parsed = v.safeParse(
			v.object({ mergedId: v.pipe(v.string(), v.minLength(1)) }),
			Object.fromEntries(await request.formData())
		);
		if (!parsed.success) return fail(400, { mergeError: say(locals, 'errors.merge.choose') });

		const merged = await mergeContacts(
			locals.services.people.contactDeps,
			viewer,
			params.id,
			parsed.output.mergedId
		);
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
		const viewer = requireViewer(locals);
		const done = await deleteContact(locals.services.people.deleteContactDeps, viewer, params.id);
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
		const viewer = requireViewer(locals);
		const done = await archiveContact(locals.services.people.contactDeps, viewer, params.id);
		if (!done) throw error(404, say(locals, 'errors.contact.notFound'));
		throw redirect(303, `/contacts/${params.id}`);
	},

	/*
	 * "This is me" (docs/02 §2.1.3), from the page of the person it is about. It toggles: the
	 * same button lets go of the link again, so a wrong pick is undone where it was made.
	 */
	setSelf: async ({ params, locals }) => {
		const user = requireUser(locals);
		const viewer = requireViewer(locals);
		const alreadyMe = user.selfContactId === params.id;

		try {
			await setSelfContact(
				locals.services.people.selfContactDeps,
				viewer,
				alreadyMe ? null : params.id
			);
		} catch (err) {
			if (err instanceof UnknownSelfContactError)
				return fail(400, { error: err.phrase(translator(locals)) });
			throw err;
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	restore: async ({ params, locals }) => {
		const viewer = requireViewer(locals);
		const done = await restoreContact(locals.services.people.contactDeps, viewer, params.id);
		if (!done) throw error(404, say(locals, 'errors.contact.notFound'));
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
