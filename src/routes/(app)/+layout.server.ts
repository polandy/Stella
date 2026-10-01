import { redirect } from '@sveltejs/kit';
import { getAccounts } from '$lib/server/services';
import { readShellPeople } from '$lib/server/shell-people';
import type { LayoutServerLoad } from './$types';

/*
 * Guard for the authenticated app. Unauthenticated visitors are sent to setup (when no
 * account exists yet) or to login. See docs/02 §2.1.
 *
 * The shell also carries the people the viewer may see, for the ⌘K palette and every picker
 * (docs/05 §5.4): one scoped read, a few hundred rows at most in a household, and it is what
 * makes a picker answer on the first keystroke instead of after a round trip. A client-side
 * navigation keeps it; `app:people` is what the shell reloads when its stamp has gone stale.
 */

/** What the shell invalidates to reload its people (`$lib/sync/people-freshness`). */
const PEOPLE_DEPENDENCY = 'app:people';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	if (!locals.user) {
		const hasUsers = (await getAccounts().countUsers()) > 0;
		throw redirect(302, hasUsers ? '/login' : '/setup');
	}
	depends(PEOPLE_DEPENDENCY);
	return { user: locals.user, ...(await readShellPeople(locals.user)) };
};
