import { error } from '@sveltejs/kit';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { answerFaceSearch } from '$lib/server/immich/routes';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * The faces *Find in Immich* offers for one person (docs/02 §2.24.2), searched by `?q=`. What it
 * answers is decided and tested in `$lib/server/immich/routes.ts`; this only wires it.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const viewer = locals.user ? { id: locals.user.id, householdId: locals.user.householdId } : null;
	const { immich } = locals.services;
	const answer = await answerFaceSearch(
		{
			immich: immich ? { ...immich.immichLinkDeps, signer: immich.signer } : null,
			isContactVisible: async (who, contactId) =>
				(await getContact(locals.services.people.contactDeps, who, contactId)) !== null,
			say: (key) => say(locals, key)
		},
		viewer,
		params.id,
		url.searchParams.get('q') ?? ''
	);
	if (answer instanceof Response) return answer;
	throw error(answer.status, say(locals, answer.message));
};
