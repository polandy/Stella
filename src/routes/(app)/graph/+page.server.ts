import { redirect } from '@sveltejs/kit';
import { listContacts } from '$lib/server/domain/contacts/contacts';
import { getContactDeps, getGraphDataSource } from '$lib/server/services';
import { buildEgoNetwork } from '$lib/graph/model/ego-network';
import { emptyModel } from '$lib/graph/model/graph-model';
import type { PageServerLoad } from './$types';

/*
 * Explorer route (docs/02 §2.7). The initial ego network is built server-side so the first
 * paint has data (no client waterfall); subsequent expansion / path search happen in the
 * browser against /graph/api. `?center=<contactId>` opens the explorer on that person — this
 * is what the profile's "Explore connections" entry links to — otherwise it centres on the
 * first visible contact. The contact list feeds in-graph search.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const contacts = await listContacts(getContactDeps(), viewer);
	const requested = url.searchParams.get('center');
	const centerId = requested ?? contacts[0]?.id ?? null;

	const model = centerId
		? await buildEgoNetwork(getGraphDataSource(viewer), centerId, 1)
		: emptyModel();

	return {
		model,
		centerId,
		contacts: contacts.map((c) => ({ id: c.id, displayName: c.displayName }))
	};
};
