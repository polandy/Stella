import { requireUser } from '$lib/server/auth/guards';
import {
	CALENDAR_PATH_PREFIX,
	calendarLinkOf,
	issueCalendarLink,
	revokeCalendarLink
} from '$lib/server/auth/calendar-link';
import type { Actions, PageServerLoad } from './$types';

/*
 * A member's calendar link (docs/02 §2.13.4). Every member manages their own: the feed shows
 * what its member may see, so nobody — an admin included — makes or withdraws one for someone
 * else.
 *
 * The link is kept hashed, so the page shows it only on the answer to the form that made it.
 * Revoking is immediate and without undo, like an API token's: it is withdrawn because it may
 * be in the wrong hands.
 */

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	return { link: await calendarLinkOf(locals.services.auth.apiTokenDeps, user.id) };
};

export const actions: Actions = {
	create: async ({ locals, url }) => {
		const user = requireUser(locals);
		const token = await issueCalendarLink(locals.services.auth.apiTokenDeps, user.id);
		return { created: `${url.origin}${CALENDAR_PATH_PREFIX}${token}.ics` };
	},

	revoke: async ({ locals }) => {
		const user = requireUser(locals);
		await revokeCalendarLink(locals.services.auth.apiTokenDeps, user.id);
		return { revoked: true };
	}
};
