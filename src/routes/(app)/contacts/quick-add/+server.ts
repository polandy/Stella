import { error, json, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import type { SelectablePerson } from '$lib/people/select';
import {
	createContact,
	getContact,
	InvalidBirthDateError
} from '$lib/server/domain/contacts/contacts';
import { say, translator } from '$lib/server/i18n/say';
import { getContactDeps } from '$lib/server/services';
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
	birthDate: optional,
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared')
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const parsed = v.safeParse(InlineCreateSchema, await request.json());
	if (!parsed.success) throw error(400, say(locals, 'errors.form.checkAndRetry'));

	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const creator = {
		userId: locals.user.id,
		householdId: locals.user.householdId,
		defaultVisibility: 'shared' as const // TODO: use the user's default (settings, §2.16)
	};

	let id: string;
	try {
		id = await createContact(getContactDeps(), creator, parsed.output);
	} catch (err) {
		throw error(
			400,
			err instanceof InvalidBirthDateError
				? err.phrase(translator(locals))
				: say(locals, 'errors.contact.needAName')
		);
	}

	// Read back through the same visibility-scoped path every other read takes, rather than
	// echoing the input: what the picker shows must be what the person actually is.
	const created = await getContact(getContactDeps(), viewer, id);
	if (created === null) throw error(500, say(locals, 'errors.contact.couldNotCreate'));

	const person: SelectablePerson = {
		id: created.id,
		displayName: created.displayName,
		firstName: created.firstName,
		lastName: created.lastName,
		nickname: created.nickname,
		description: created.description
	};
	return json(person, { status: 201 });
};
