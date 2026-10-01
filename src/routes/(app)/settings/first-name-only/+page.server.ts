import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { describeContact, EmptyDescriptionError, listContacts } from '$lib/server/domain/contacts/contacts';
import { contextOfPeople } from '$lib/server/domain/contacts/person-context';
import { getAttention, getContactDeps, getPersonContextDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import { isKnownByAFirstNameOnly, suggestedDescription } from '$lib/people/namesakes';
import type { Actions, PageServerLoad } from './$types';

/*
 * Tidying up the people known by a first name only (docs/02 §2.2.3): everyone the viewer may
 * see with nothing yet to tell them apart, to be given a description where they are listed.
 * Archived people are left out — they are out of the way already. Where a link or a circle
 * says who someone is, the field starts out filled with it, in words fit to be stored for
 * everyone: *Sibling of Andy Brunner*, never *Your sibling*.
 */

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const [everyone, touches] = await Promise.all([
		listContacts(getContactDeps(), viewer),
		getAttention().listLastTouchedVisibleTo(viewer)
	]);
	const today = new Date().toLocaleDateString('en-CA');
	const firstNameOnly = everyone.filter(isKnownByAFirstNameOnly);
	// Read here rather than taken from the shell, which holds it for namesakes only: a Thomas
	// nobody else shares a name with still deserves a suggestion from his links.
	const peopleContext = await contextOfPeople(getPersonContextDeps(), viewer, {
		people: firstNameOnly,
		selfContactId: locals.user.selfContactId,
		today
	});
	const t = translator(locals);
	// When they were last written about is what tells a Thomas worth keeping from one met once.
	const lastTouchedOn = new Map(touches.map((t) => [t.contactId, t.lastTouchedOn]));
	return {
		people: firstNameOnly.map((c) => ({
			...c,
			lastTouchedOn: lastTouchedOn.get(c.id) ?? null,
			suggestion: suggestedDescription(t, everyone, peopleContext[c.id])
		})),
		today
	};
};

const DescribeSchema = v.object({
	id: v.pipe(v.string(), v.minLength(1)),
	description: v.string()
});

export const actions: Actions = {
	describe: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const parsed = v.safeParse(DescribeSchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) throw error(400, say(locals, 'errors.contact.emptyDescription'));

		try {
			const saved = await describeContact(getContactDeps(), viewer, parsed.output.id, parsed.output.description);
			if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));
		} catch (err) {
			if (err instanceof EmptyDescriptionError)
				return fail(400, { describeError: err.phrase(translator(locals)), describedId: parsed.output.id });
			throw err;
		}
		// The reloaded list no longer has them.
		return { described: parsed.output.id };
	}
};
