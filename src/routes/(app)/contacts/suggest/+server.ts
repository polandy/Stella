import { json, redirect } from '@sveltejs/kit';
import { suggestNameCandidates } from '$lib/server/domain/contacts/suggestions';
import { getSuggestionDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * Duplicate & relative suggestions for quick-add (docs/02 §2.2.1): the people the viewer
 * may see whose name looks like the one being typed. Read-only, visibility-scoped through
 * the same access layer as every other read.
 */

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const candidates = await suggestNameCandidates(getSuggestionDeps(), viewer, {
		firstName: url.searchParams.get('firstName'),
		lastName: url.searchParams.get('lastName')
	});
	return json(candidates);
};
