import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parseCommand } from '$lib/server/commands/parse';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { proposeHref } from '$lib/contacts/propose';
import { decodeRelationshipChoice } from '$lib/relationships/type-options';
import { contactSectionPath } from '$lib/contacts/sections';
import {
	ContradictoryRelationshipError,
	DuplicateRelationshipError,
	editRelationship,
	InvalidRelationshipDetailsError,
	removeRelationship,
	removeRelationships,
	RelationshipExcludedError
} from '$lib/server/domain/relationships/relationships';
import {
	acceptClaim,
	declineClaim,
	restoreClaim
} from '$lib/server/relationships/suggestion-answers';
import { RelationshipsRefusedError } from '$lib/server/domain/relationships/add-many';
import { getCommandDeps, getRelationshipDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import { reviewPath } from '../review-path';
import type { Actions } from '../$types';

/** The specifics of a link (docs/02 §2.4); the domain has the last word on what is real. */
const RelationshipDetailsSchema = {
	description: v.optional(v.pipe(v.string(), v.trim())),
	sinceDate: v.optional(v.pipe(v.string(), v.trim())),
	status: v.optional(v.pipe(v.string(), v.trim()))
};

const AddRelationshipSchema = v.object({
	targetId: v.pipe(v.string(), v.minLength(1)),
	/** Type *and* direction, as `relationshipTypeOptions` encodes them. */
	typeChoice: v.pipe(v.string(), v.minLength(1)),
	...RelationshipDetailsSchema
});

const EditRelationshipSchema = v.object({
	relationshipId: v.pipe(v.string(), v.minLength(1)),
	/** Type *and* direction, as `relationshipTypeOptions` encodes them; absent leaves the type. */
	typeChoice: v.optional(v.pipe(v.string(), v.minLength(1))),
	...RelationshipDetailsSchema
});

/** The relationships card: links, their corrections, and the answers to suggestions (docs/02 §2.4). */
export const relationshipActions = {
	addRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const parsed = v.safeParse(AddRelationshipSchema, {
			targetId: form.get('targetId'),
			typeChoice: form.get('typeChoice'),
			description: form.get('description') || undefined,
			sinceDate: form.get('sinceDate') || undefined,
			status: form.get('status') || undefined
		});
		if (!parsed.success) {
			return fail(400, { error: say(locals, 'errors.relationship.needPersonAndType') });
		}

		// A command (docs/04 §4.11.2), named by the form so one kept on the phone is recognised;
		// `addRelationshipChecked` holds every check the page used to make here.
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'relationship.add',
			payload: { contactId: params.id, ...parsed.output },
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'relationship.add') {
			return fail(400, { error: say(locals, 'errors.relationship.needPersonAndType') });
		}
		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			locale: locals.locale
		};
		const outcome = await dispatchCommand(getCommandDeps(), author, command);
		if (outcome.status !== 'applied') {
			return fail(outcome.status === 'refused' ? 409 : 400, {
				error:
					outcome.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.relationship.couldNotAdd')
			});
		}

		// Come back with the new pair named, so its implied links can be offered.
		throw redirect(303, proposeHref(params.id, [parsed.output.targetId]));
	},

	/**
	 * Link several people in one go (docs/02 §2.4, ADR-118): the shared fields once, then
	 * `targetId` and `sinceDate` once per picked person, in
	 * the same order. All or nothing; a refusal names each refused person so the form can mark
	 * them. Applied, it answers the new ids, so one *Undo* can take the whole batch back
	 * (`removeRelationships`).
	 */
	addRelationships: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const targetIds = form.getAll('targetId');
		const sinceDates = form.getAll('sinceDate');
		// A since field per person, even when blank; a form that lost the pairing is not guessed at.
		if (sinceDates.length !== targetIds.length) {
			return fail(400, { error: say(locals, 'errors.relationship.needPersonAndType') });
		}
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'relationship.addMany',
			payload: {
				contactId: params.id,
				typeChoice: form.get('typeChoice'),
				status: form.get('status') || null,
				description: form.get('description'),
				links: targetIds.map((targetId, index) => ({ targetId, sinceDate: sinceDates[index] }))
			},
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'relationship.addMany') {
			return fail(400, { error: say(locals, 'errors.relationship.needPersonAndType') });
		}

		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			locale: locals.locale
		};
		const outcome = await dispatchCommand(getCommandDeps(), author, command);
		if (outcome.status === 'applied') return { relationshipIds: outcome.result.relationshipIds };
		if (outcome.status !== 'refused') {
			return fail(400, { error: say(locals, 'errors.relationship.couldNotAdd') });
		}
		const t = translator(locals);
		const refusals =
			outcome.error instanceof RelationshipsRefusedError
				? outcome.error.refusals.map((refusal) => ({
						targetId: refusal.targetId,
						reason: refusal.reason(t)
					}))
				: [];
		return fail(409, { error: outcome.reason(t), refusals });
	},

	/**
	 * Take back a batch added together, in one step (docs/02 §2.4): every `relationshipId`
	 * posted, or — when any is gone or out of sight — none.
	 */
	removeRelationships: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const ids = (await request.formData()).getAll('relationshipId');
		if (ids.length === 0 || !ids.every((id): id is string => typeof id === 'string' && id !== '')) {
			return fail(400, {});
		}
		if (!(await removeRelationships(getRelationshipDeps(), viewer, ids))) {
			return fail(404, { error: say(locals, 'errors.relationship.notFound') });
		}
		throw redirect(303, contactSectionPath(params.id, 'relationships'));
	},

	/** Correct a link: its specifics, and its type where the tie was named wrongly (docs/02 §2.4). */
	editRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const parsed = v.safeParse(EditRelationshipSchema, {
			relationshipId: form.get('relationshipId'),
			typeChoice: form.get('typeChoice') || undefined,
			description: form.get('description') || undefined,
			sinceDate: form.get('sinceDate') || undefined,
			status: form.get('status') || undefined
		});
		if (!parsed.success)
			return fail(400, { error: say(locals, 'errors.relationship.couldNotSave') });

		// A choice the picker did not write names no type and no side, so it cannot be stored.
		const choice = parsed.output.typeChoice
			? decodeRelationshipChoice(parsed.output.typeChoice)
			: null;
		if (parsed.output.typeChoice && !choice) {
			return fail(400, { error: say(locals, 'errors.relationship.couldNotSave') });
		}

		try {
			const saved = await editRelationship(getRelationshipDeps(), viewer, {
				relationshipId: parsed.output.relationshipId,
				perspectiveContactId: params.id,
				typeChoice: choice,
				description: parsed.output.description ?? null,
				sinceDate: parsed.output.sinceDate ?? null,
				status: parsed.output.status ?? null
			});
			if (!saved) return fail(404, { error: say(locals, 'errors.relationship.notFound') });
		} catch (err) {
			if (err instanceof DuplicateRelationshipError) {
				return fail(409, { error: say(locals, 'errors.relationship.duplicate') });
			}
			if (err instanceof ContradictoryRelationshipError) {
				return fail(409, { error: say(locals, 'errors.relationship.contradiction') });
			}
			// The picker greys these out, so this is the hand-written post — refused all the same.
			if (err instanceof RelationshipExcludedError) {
				return fail(409, { error: err.phrase(translator(locals)) });
			}
			if (err instanceof InvalidRelationshipDetailsError) {
				return fail(400, { error: err.phrase(translator(locals)) });
			}
			throw err;
		}

		throw redirect(303, contactSectionPath(params.id, 'relationships'));
	},

	/** Take back a link that was entered wrong (docs/02 §2.4). Undo is the page's own. */
	removeRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const relationshipId = form.get('relationshipId');
		if (typeof relationshipId !== 'string') return fail(400, {});

		if (!(await removeRelationship(getRelationshipDeps(), viewer, relationshipId))) {
			return fail(404, { error: say(locals, 'errors.relationship.notFound') });
		}
		throw redirect(303, contactSectionPath(params.id, 'relationships'));
	},

	/**
	 * Store one propagation suggestion (docs/02 §2.4.1). Both endpoints are checked against
	 * the viewer, and the pair is carried on so the remaining suggestions stay on screen.
	 */
	addProposedRelationship: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const refusal = await acceptClaim(locals, viewer, form);
		if (refusal) return fail(refusal.status, { error: refusal.message });

		// The pointer the block hangs on, so confirming one row keeps the others on screen.
		const propose = form.get('propose');
		const back = typeof propose === 'string' && propose ? `?propose=${propose}` : '';
		throw redirect(303, `/contacts/${params.id}${back}#relationships`);
	},

	/**
	 * Decline a claim, so it stops being offered however a rule reaches it later
	 * (docs/04 ADR-117). The household decided, so the *no*
	 * holds for every member — and `restoreSuggestion` takes it back.
	 */
	dismissSuggestion: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const refusal = await declineClaim(locals, viewer, await request.formData());
		if (refusal) return fail(refusal.status, { error: refusal.message });
		throw redirect(303, reviewPath(params.id));
	},

	/** Take a *no* back, so the claim is offered again on the next review (§6.5). */
	restoreSuggestion: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const refusal = await restoreClaim(locals, viewer, await request.formData());
		if (refusal) return fail(refusal.status, { error: refusal.message });
		throw redirect(303, reviewPath(params.id));
	}
} satisfies Actions;
