import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	EmptyLastNameError,
	LastNameWouldOverwriteError,
	setLastNames
} from './domain/contacts/last-names';
import { say, translator } from './i18n/say';
import { getLastNameDeps } from './services';

/*
 * The one form action behind every path that gives several people a last name
 * (docs/concepts/surnames.md §3, §7): the *Last names* list, *Select* on People and on a
 * circle, and passing a name on. Each page spreads it into its own actions, so the rule — every
 * id visible or nothing written, no silent overwrite, one log line — lives in one place.
 */

const SetLastNamesSchema = v.object({
	lastName: v.pipe(v.string(), v.trim(), v.minLength(1)),
	contactIds: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
	/** Those of `contactIds` ticked by hand to replace the last name they already have. */
	replaceIds: v.array(v.string())
});

export const lastNameActions = {
	setLastNames: async ({ request, locals }: RequestEvent) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(SetLastNamesSchema, {
			lastName: form.get('lastName') ?? '',
			contactIds: form.getAll('contactId'),
			replaceIds: form.getAll('replaceId')
		});
		if (!parsed.success) return fail(400, { lastNamesError: say(locals, 'errors.contact.emptyLastName') });

		const { lastName, contactIds, replaceIds } = parsed.output;
		const replace = new Set(replaceIds);
		try {
			const written = await setLastNames(
				getLastNameDeps(),
				viewer,
				contactIds.map((contactId) => ({ contactId, lastName, replace: replace.has(contactId) })),
				// The log line is written once, in the language of whoever gave the name.
				(name, count) => say(locals, 'surnames.log', { name, count }),
				locals.locale
			);
			if (written === null) throw error(404, say(locals, 'errors.contact.notFound'));
			return { lastNamesSet: written };
		} catch (err) {
			if (err instanceof EmptyLastNameError || err instanceof LastNameWouldOverwriteError)
				return fail(400, { lastNamesError: err.phrase(translator(locals)) });
			throw err;
		}
	}
};
