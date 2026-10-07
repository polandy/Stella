import { json } from '@sveltejs/kit';
import type { VisiblePerson } from '$lib/pwa/people-ahead';
import { listContacts } from '$lib/server/domain/contacts/contacts';
import type { RequestHandler } from './$types';

/*
 * `GET /api/offline/people` (docs/02 §2.18, docs/04 ADR-114): who the member can see right
 * now, so the service worker knows whose pages to keep ahead and whose to throw away. The same
 * list as the People directory, read through the same use-case. Signed in by the session
 * cookie, like `/api/commands`: the app talking to itself, not the scripting API.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) return json({ error: { code: 'unauthorized' } }, { status: 401 });

	const viewer = { id: user.id, householdId: user.householdId };
	const people: VisiblePerson[] = (
		await listContacts(locals.services.people.contactDeps, viewer)
	).map(({ id, avatarPhotoId }) => ({
		id,
		avatarPhotoId
	}));
	// An answer about right now: a copy of it would keep a person on the device, or drop one.
	return json({ people }, { headers: { 'Cache-Control': 'no-store' } });
};
