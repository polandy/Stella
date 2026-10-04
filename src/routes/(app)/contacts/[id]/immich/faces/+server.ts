import { error, json } from '@sveltejs/kit';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { findImmichFaces } from '$lib/server/domain/immich/links';
import type { ImmichFailure } from '$lib/server/domain/immich/gateway';
import { getContactDeps, getImmich } from '$lib/server/services';
import { say } from '$lib/server/i18n/say';
import type { MessageKey } from '$lib/i18n/translate';
import type { RequestHandler } from './$types';

/*
 * The faces *Find in Immich* offers for one person (docs/concepts/immich.md §4.3), searched by
 * `?q=`. Only for a person the member can see, so the picker is never a way to probe the
 * library from a page the member could not open. The faces themselves come through
 * `/media/immich/people/{id}/thumbnail`; nothing here hands the browser a way to Immich.
 */

const FAILURE_MESSAGE: Record<ImmichFailure, MessageKey> = {
	unauthorized: 'immich.error.keyRejected',
	forbidden: 'immich.settings.scope.person.read',
	notFound: 'immich.error.unreachable',
	unreachable: 'immich.error.unreachable'
};

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, say(locals, 'errors.notSignedIn'));
	const immich = getImmich();
	if (!immich) throw error(404, say(locals, 'errors.notFound'));
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	if (!(await getContact(getContactDeps(), viewer, params.id))) {
		throw error(404, say(locals, 'errors.contact.notFound'));
	}

	const found = await findImmichFaces(immich, url.searchParams.get('q') ?? '');
	if (!found.ok) return json({ faces: [], error: say(locals, FAILURE_MESSAGE[found.failure]) });
	return json({ faces: found.faces, error: null });
};
