import { json } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { suggestNameCandidates } from '$lib/server/domain/contacts/suggestions';
import type { RequestHandler } from './$types';

/*
 * Duplicate & relative suggestions for quick-add (docs/02 §2.2.1): the people the viewer
 * may see whose name looks like the one being typed. Read-only, visibility-scoped through
 * the same access layer as every other read.
 */

export const GET: RequestHandler = async ({ locals, url }) => {
	const viewer = requireViewer(locals);
	const candidates = await suggestNameCandidates(locals.services.people.suggestionDeps, viewer, {
		firstName: url.searchParams.get('firstName'),
		lastName: url.searchParams.get('lastName')
	});
	return json(candidates);
};
