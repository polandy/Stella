import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { describeContact, EmptyDescriptionError, listContacts } from '$lib/server/domain/contacts/contacts';
import { getAttention, getContactDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import { isKnownByAFirstNameOnly } from '$lib/people/namesakes';
import type { Actions, PageServerLoad } from './$types';

/*
 * Tidying up the people known by a first name only (docs/02 §2.2.3): everyone the viewer may
 * see with nothing yet to tell them apart, to be given a description where they are listed.
 * Archived people are left out — they are out of the way already.
 */

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const [everyone, touches] = await Promise.all([
		listContacts(getContactDeps(), viewer),
		getAttention().listQuietSourcesVisibleTo(viewer)
	]);
	// When they were last written about is what tells a Thomas worth keeping from one met once.
	const lastTouchedOn = new Map(touches.map((t) => [t.contactId, t.lastTouchedOn]));
	return {
		people: everyone
			.filter(isKnownByAFirstNameOnly)
			.map((c) => ({ ...c, lastTouchedOn: lastTouchedOn.get(c.id) ?? null })),
		today: new Date().toLocaleDateString('en-CA')
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
