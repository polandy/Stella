import { redirect } from '@sveltejs/kit';
import { nextcloudWording } from '$lib/server/i18n/import-wording';
import { syncOnOpen } from '$lib/server/nextcloud/sync-on-open';
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
 * The tags the viewer can see ride along for the `#` list (docs/02 §2.20.2), for the same reason.
 *
 * Opening Stella also syncs the linked Nextcloud book when it is due (docs/02 §2.16.3), without
 * the page waiting for it.
 */

/** What the shell invalidates to reload its people (`$lib/sync/people-freshness`). */
const PEOPLE_DEPENDENCY = 'app:people';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	if (!locals.user) {
		const hasUsers = (await locals.services.auth.accounts.countUsers()) > 0;
		throw redirect(302, hasUsers ? '/login' : '/setup');
	}
	depends(PEOPLE_DEPENDENCY);
	const { nextcloud } = locals.services;
	if (nextcloud) {
		void syncOnOpen(nextcloud.link, locals.user, {
			wording: nextcloudWording(locals),
			locale: locals.locale
		});
	}
	const [people, entryTags] = await Promise.all([
		readShellPeople(locals.services.people, locals.user),
		locals.services.story.entryTags.listVisibleTo(locals.user)
	]);
	return { user: locals.user, ...people, entryTags };
};
