import { error, json } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import * as v from 'valibot';
import type { SelectablePerson } from '$lib/people/select';
import { TranslatableError } from '$lib/i18n/translatable';
import { createContact, getContact } from '$lib/server/domain/contacts/contacts';
import { say, translator } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * Creating a person from inside a person picker (docs/02 §2.2.2). The same use-case the
 * quick-add page runs, answered as JSON so the picker can name someone new without leaving
 * the form it sits in — and hand back a person in exactly the shape it already renders for
 * a search hit.
 */

const optional = v.optional(v.pipe(v.string(), v.trim()));

const InlineCreateSchema = v.object({
	firstName: optional,
	lastName: optional,
	nickname: optional,
	/** Asked for when there is no last name, so this Thomas can be told from the next (§2.2.3). */
	description: optional,
	birthDate: optional,
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared')
});

export const POST: RequestHandler = async ({ request, locals }) => {
	// Before anything the request sent is read, so an anonymous caller is redirected rather
	// than answered with a 400 for a body it was never going to be allowed to post anyway.
	const viewer = requireViewer(locals);

	const parsed = v.safeParse(InlineCreateSchema, await request.json());
	if (!parsed.success) throw error(400, say(locals, 'errors.form.checkAndRetry'));

	const creator = {
		userId: viewer.id,
		householdId: viewer.householdId,
		locale: locals.locale,
		// New people are shared unless picked private (docs/02 §2.10).
		defaultVisibility: 'shared' as const
	};

	let id: string;
	try {
		id = await createContact(locals.services.people.contactDeps, creator, parsed.output);
	} catch (err) {
		throw error(
			400,
			// A birthday that is no day, or a first name with nothing to know them by (§2.2.3).
			err instanceof TranslatableError
				? err.phrase(translator(locals))
				: say(locals, 'errors.contact.needAName')
		);
	}

	// Read back through the same visibility-scoped path every other read takes, rather than
	// echoing the input: what the picker shows must be what the person actually is.
	const created = await getContact(locals.services.people.contactDeps, viewer, id);
	if (created === null) throw error(500, say(locals, 'errors.contact.couldNotCreate'));

	const person: SelectablePerson = {
		id: created.id,
		displayName: created.displayName,
		firstName: created.firstName,
		lastName: created.lastName,
		nickname: created.nickname,
		description: created.description,
		metPlace: created.metPlace,
		metDate: created.metDate,
		birthDate: created.birthDate,
		avatarPhotoId: created.avatarPhotoId
	};
	return json(person, { status: 201 });
};
