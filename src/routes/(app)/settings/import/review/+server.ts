import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/guards';
import { getConfig } from '$lib/server/config';
import { findForReview } from '$lib/server/domain/import/review-view';
import { readStagedDump } from '$lib/server/import/staging';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * *Pick someone else* on a review card (docs/02 §2.16): the people whose name holds the
 * query, each with what *Same person* would do with that card. Only people the member may
 * browse are found.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const user = requireAdmin(locals);
	const token = url.searchParams.get('token');
	const key = url.searchParams.get('key');
	if (!token || !key) throw error(400, say(locals, 'import.error.missingToken'));
	const text = await readStagedDump(getConfig().importDir, token);
	if (text === null) throw error(410, say(locals, 'import.error.sessionOver'));
	return json(
		await findForReview(
			locals.services.archive.reviewViewDeps,
			{ id: user.id, householdId: user.householdId },
			text,
			{ key, query: url.searchParams.get('q') ?? '' }
		)
	);
};
