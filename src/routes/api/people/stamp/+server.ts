import { json } from '@sveltejs/kit';
import { readShellPeople } from '$lib/server/shell-people';
import type { RequestHandler } from './$types';

/*
 * `GET /api/people/stamp`: the stamp of the people the app shell would send right now, so a
 * page that kept the shell across a navigation can tell whether its list is still current
 * (`$lib/sync/people-freshness`, docs/04 §4.9). Signed in by the session cookie, like
 * `/api/offline/people`: the app talking to itself, not the scripting API.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) return json({ error: { code: 'unauthorized' } }, { status: 401 });
	const { peopleStamp } = await readShellPeople(user);
	// An answer about right now; a kept copy would say a stale list is current.
	return json({ stamp: peopleStamp }, { headers: { 'Cache-Control': 'no-store' } });
};
