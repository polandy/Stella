import { error, fail } from '@sveltejs/kit';
import { requireUser, requireViewer } from '$lib/server/auth/guards';
import { TranslatableError } from '$lib/i18n/translatable';
import type { MessageKey } from '$lib/i18n/translate';
import type { ImmichFailure } from '$lib/server/domain/immich/gateway';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { ContactGoneError } from '$lib/server/domain/contacts/require-visible';
import { authorNames } from '$lib/server/domain/household/members';
import {
	addPersonFromImmich,
	assignNewcomer,
	WouldReplaceLinkError
} from '$lib/server/domain/immich/add-from-immich';
import { faceUrlFor } from '$lib/server/domain/immich/glimpse';
import { ignoreMatch, proposeAgain } from '$lib/server/domain/immich/ignores';
import { ImmichLinkRefusedError, linkMatches } from '$lib/server/domain/immich/links';
import { findImmichMatches } from '$lib/server/domain/immich/matching';
import { ignoreNewcomer, proposeNewcomerAgain } from '$lib/server/domain/immich/name-ignores';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions, PageServerLoad } from './$types';
import { systemClock } from '$lib/server/clock';
import { todayFor } from '$lib/dates/today';
import { newcomerOf, newcomerToAdd, pairsOf, rowOf } from './immich-form';

/*
 * *Settings → Immich → Find your people* (docs/02 §2.24.7): every
 * person the viewer sees, next to the Immich face their name matches. Any member may use it — a
 * link is household data (§2.24.2). Without Immich it does not exist.
 *
 * The list is handed over as a promise: the page opens at once, and the rows arrive when Immich
 * has listed its people. A link changes nothing else on the page, so linking does not ask Immich
 * for the whole list again — the screen takes the linked rows away itself.
 *
 * The second tab, *New from Immich*, comes from the same promise: the named faces nobody in
 * Stella holds, each to be assigned to someone already here or added as a new person.
 */

/** What the page says when Immich gave no list. */
const FAILURE_MESSAGE: Record<ImmichFailure, MessageKey> = {
	unauthorized: 'immich.error.keyRejected',
	forbidden: 'immich.settings.scope.person.read',
	notFound: 'immich.error.unreachable',
	unreachable: 'immich.error.unreachable'
};

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const deps = locals.services.immich?.immichMatchingDeps;
	if (!deps) throw error(404, say(locals, 'errors.notFound'));
	const viewer = requireViewer(locals);
	const nameOfMember = authorNames(locals.services.household.memberDeps, viewer.householdId);
	const day = {
		selfContactId: user.selfContactId,
		today: todayFor(systemClock)
	};
	return {
		matches: Promise.all([findImmichMatches(deps, viewer, day), nameOfMember]).then(
			([outcome, nameOf]) =>
				outcome.ok
					? {
							rows: outcome.rows,
							// Who ignored each pair, by name — null for someone no longer a member.
							ignored: outcome.ignored.map((pair) => ({
								...pair,
								ignoredByName: nameOf(pair.ignoredBy)
							})),
							newcomers: outcome.newcomers,
							ignoredNewcomers: outcome.ignoredNewcomers.map((face) => ({
								...face,
								ignoredByName: nameOf(face.ignoredBy)
							})),
							error: null
						}
					: {
							rows: [],
							ignored: [],
							newcomers: [],
							ignoredNewcomers: [],
							error: say(locals, FAILURE_MESSAGE[outcome.failure])
						}
		)
	};
};

/** One row's Link and *Link all likely* are the same action: a list of confirmed pairs. */
const linking: Actions[string] = async ({ request, locals }) => {
	const viewer = requireViewer(locals);
	const deps = locals.services.immich?.immichLinkDeps;
	if (!deps) throw error(404, say(locals, 'errors.notFound'));
	const pairs = pairsOf(await request.formData());
	if (!pairs) return fail(400, { linked: [], refused: [], error: say(locals, 'errors.notFound') });

	const result = await linkMatches(
		deps,
		{ userId: viewer.id, householdId: viewer.householdId },
		pairs
	);
	const refusedIds = new Set(result.refused.map((r) => r.contactId));
	const t = translator(locals);
	return {
		linked: pairs.map((p) => p.contactId).filter((id) => !refusedIds.has(id)),
		refused: result.refused.map((r) => ({ contactId: r.contactId, message: r.error.phrase(t) })),
		error: null
	};
};

/** The actor of an action, or a redirect to sign in. */
function actorOf(locals: App.Locals) {
	const viewer = requireViewer(locals);
	return { userId: viewer.id, householdId: viewer.householdId };
}

export const actions: Actions = {
	link: linking,
	linkAll: linking,

	/* Ignore a row: the contact with every face the row showed (docs/02 §2.24.7). */
	ignore: async ({ request, locals }) => {
		const actor = actorOf(locals);
		const deps = locals.services.immich?.immichIgnoreDeps;
		if (!deps) throw error(404, say(locals, 'errors.notFound'));
		const row = rowOf(await request.formData());
		if (!row) return fail(400, { linked: [], refused: [], error: say(locals, 'errors.notFound') });
		try {
			await ignoreMatch(deps, actor, row.contactId, row.personIds);
		} catch (err) {
			// A person gone meanwhile answers 404, which the held Ignore reads as done (§2.23).
			if (err instanceof ContactGoneError)
				return fail(404, { linked: [], refused: [], error: err.phrase(translator(locals)) });
			if (err instanceof ImmichLinkRefusedError)
				return fail(400, { linked: [], refused: [], error: err.phrase(translator(locals)) });
			throw err;
		}
		return { linked: [], refused: [], error: null };
	},

	/* Propose again: forget that a pair was ignored. Nothing to say when it already was. */
	proposeAgain: async ({ request, locals }) => {
		const actor = actorOf(locals);
		const deps = locals.services.immich?.immichIgnoreDeps;
		if (!deps) throw error(404, say(locals, 'errors.notFound'));
		const row = rowOf(await request.formData());
		if (!row || row.personIds.length !== 1)
			return fail(400, { linked: [], refused: [], error: say(locals, 'errors.notFound') });
		await proposeAgain(
			deps,
			{ id: actor.userId, householdId: actor.householdId },
			row.contactId,
			row.personIds[0]
		);
		return { linked: [], refused: [], error: null };
	},

	/*
	 * *This is the person* on *New from Immich*, from the comparison step or the person search:
	 * the face goes to someone already in Stella. `replace` is posted only once the member
	 * confirmed that it takes the place of the face they are linked to.
	 */
	assignNewcomer: async ({ request, locals }) => {
		const actor = actorOf(locals);
		const deps = locals.services.immich?.immichLinkDeps;
		if (!deps) throw error(404, say(locals, 'errors.notFound'));
		const form = await request.formData();
		const personId = newcomerOf(form);
		const contactId = form.get('contactId');
		if (!personId || typeof contactId !== 'string')
			throw error(400, say(locals, 'errors.form.checkAndRetry'));
		try {
			await assignNewcomer(deps, actor, contactId, personId, {
				replace: form.get('replace') === '1'
			});
		} catch (err) {
			if (err instanceof ContactGoneError || err instanceof ImmichLinkRefusedError)
				return fail(400, {
					newcomer: personId,
					newcomerError: err.phrase(translator(locals)),
					// Asked rather than refused: the member may confirm and post again.
					wouldReplace: err instanceof WouldReplaceLinkError ? contactId : null
				});
			throw err;
		}
		const contact = await getContact(
			locals.services.people.contactDeps,
			{ id: actor.userId, householdId: actor.householdId },
			contactId
		);
		return { assigned: { personId, contactId, name: contact?.displayName ?? '' } };
	},

	/*
	 * *Add and link*: a new person from the face, shared like anyone added by hand. With *Use the
	 * face as photo*, the answer carries the face signed for the new person; the browser keeps it
	 * as their photo through *Use as photo* (docs/02 §2.24.6), re-encoded like any new picture.
	 */
	addNewcomer: async ({ request, locals }) => {
		const actor = actorOf(locals);
		const { immich } = locals.services;
		if (!immich) throw error(404, say(locals, 'errors.notFound'));
		const posted = newcomerToAdd(await request.formData());
		if (!posted) throw error(400, say(locals, 'errors.form.checkAndRetry'));
		const { immichPersonId, usePhoto, name } = posted;
		let contactId: string;
		try {
			contactId = await addPersonFromImmich(
				immich.addFromImmichDeps,
				{ ...actor, locale: locals.locale },
				immichPersonId,
				name
			);
		} catch (err) {
			// A first name with nothing to know them by (§2.2.3), or a face that cannot be linked.
			if (err instanceof TranslatableError)
				return fail(400, {
					newcomer: immichPersonId,
					newcomerError: err.phrase(translator(locals)),
					wouldReplace: null
				});
			throw err;
		}
		const contact = await getContact(
			locals.services.people.contactDeps,
			{ id: actor.userId, householdId: actor.householdId },
			contactId
		);
		return {
			added: {
				personId: immichPersonId,
				contactId,
				name: contact?.displayName ?? '',
				faceUrl: usePhoto ? await faceUrlFor(immich.signer, contactId, immichPersonId) : null
			}
		};
	},

	/* Ignore a face of *New from Immich*, for the whole household (held for the undo window). */
	ignoreNewcomer: async ({ request, locals }) => {
		const actor = actorOf(locals);
		const deps = locals.services.immich?.immichNameIgnoreDeps;
		if (!deps) throw error(404, say(locals, 'errors.notFound'));
		const personId = newcomerOf(await request.formData());
		if (!personId) throw error(400, say(locals, 'errors.form.checkAndRetry'));
		try {
			await ignoreNewcomer(deps, actor, personId);
		} catch (err) {
			if (err instanceof ImmichLinkRefusedError)
				return fail(400, {
					newcomer: personId,
					newcomerError: err.phrase(translator(locals)),
					wouldReplace: null
				});
			throw err;
		}
		return { ignoredNewcomer: personId };
	},

	/* Propose an ignored face again. Nothing to say when it already was. */
	proposeNewcomerAgain: async ({ request, locals }) => {
		const actor = actorOf(locals);
		const deps = locals.services.immich?.immichNameIgnoreDeps;
		if (!deps) throw error(404, say(locals, 'errors.notFound'));
		const personId = newcomerOf(await request.formData());
		if (!personId) throw error(400, say(locals, 'errors.form.checkAndRetry'));
		await proposeNewcomerAgain(
			deps,
			{ id: actor.userId, householdId: actor.householdId },
			personId
		);
		return { proposedAgain: personId };
	}
};
