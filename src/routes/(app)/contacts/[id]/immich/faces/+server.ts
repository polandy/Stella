import { error } from '@sveltejs/kit';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { answerFaceSearch } from '$lib/server/immich/routes';
import { getContactDeps, getImmich, getImmichLinkDeps } from '$lib/server/services';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * The faces *Find in Immich* offers for one person (docs/concepts/immich.md §4.3, docs/02
 * §2.24.2), searched by `?q=`. What it answers is decided and tested in
 * `$lib/server/immich/routes.ts`; this only wires it.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const viewer = locals.user ? { id: locals.user.id, householdId: locals.user.householdId } : null;
	const linkDeps = getImmichLinkDeps();
	const immich = getImmich();
	const answer = await answerFaceSearch(
		{
			immich: linkDeps && immich ? { ...linkDeps, signer: immich.signer } : null,
			isContactVisible: async (who, contactId) => (await getContact(getContactDeps(), who, contactId)) !== null,
			say: (key) => say(locals, key)
		},
		viewer,
		params.id,
		url.searchParams.get('q') ?? ''
	);
	if (answer instanceof Response) return answer;
	throw error(answer.status, say(locals, answer.message));
};
