import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { phrase } from '$lib/i18n/phrase';
import { proposeHref } from '$lib/people/propose';
import { encodeRelationshipChoice } from '$lib/relationships/type-options';
import { PARENT_CHILD_TYPE_KEY } from '$lib/relationships/type-keys';
import type { Viewer } from '$lib/server/access/visibility';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import type { CommandHandlers } from '$lib/server/domain/commands/dispatch';
import { CommandFailedError } from '$lib/server/domain/commands/dispatch';
import { RelationshipsRefusedError } from '$lib/server/domain/relationships/add-many';
import {
	ContradictoryRelationshipError,
	DuplicateRelationshipError,
	RelationshipExcludedError,
	type RelationshipRepository,
	type RelationshipType
} from '$lib/server/domain/relationships/relationships';
import {
	commandDepsWith,
	inMemoryKinshipGraph,
	inMemoryReceipts,
	inMemoryRelationshipTies,
	relationshipRepositoryWith
} from '$lib/server/domain/testing';
import {
	answerOf,
	formOf,
	MEMBER,
	routeEvent,
	type EdgeAnswer,
	type FakeServices
} from '$lib/server/testing';
import type { ClaimAnswerServices } from '../../../_shared/suggestion-answers';
import { relationshipActions as actions } from './relationships';

/*
 * The relationships card's actions (docs/02 §2.4) as the edge answers them: the form read, each
 * outcome of the command or the use-case turned into a status and a sentence, and where a
 * success goes back to. The use-cases have their own suites; the fakes here only answer the way
 * the case under test needs.
 */

const t = createTranslator('en');
const viewer: Viewer = { id: MEMBER.id, householdId: MEMBER.householdId };
const COMMAND_ID = '01HZZZZZZZZZZZZZZZZZZZZZZA';
const CHOICE = encodeRelationshipChoice('type-parent', 'forward');
const PAGE = { id: 'anna' };

/** Runs `action` on Anna's page with `form` posted, over `services`. */
const post = (action: (event: never) => Promise<unknown>, services: FakeServices, form: FormData) =>
	answerOf(action(routeEvent({ services, params: PAGE, form })));

/** The commands the form posts, through handlers the test names. */
const commanding = (handlers: Partial<CommandHandlers>, receipts = inMemoryReceipts()) => ({
	offline: { commandDeps: commandDepsWith(handlers, receipts) }
});

const relating = (methods: Partial<RelationshipRepository>) => ({
	relationships: {
		relationshipDeps: {
			relationships: relationshipRepositoryWith(methods),
			kinship: inMemoryKinshipGraph(),
			ties: inMemoryRelationshipTies(),
			types: { getType: async () => null },
			ids: { next: () => 'id-1' },
			clock: { now: () => 42 }
		}
	}
});

describe('addRelationship', () => {
	const link = { commandId: COMMAND_ID, targetId: 'ben', typeChoice: CHOICE };

	it('adds the link and comes back with the new pair named', async () => {
		const payloads: unknown[] = [];
		const services = commanding({
			'relationship.add': async (_actor, payload) => {
				payloads.push(payload);
				return { relationshipId: 'r1' };
			}
		});
		expect(await post(actions.addRelationship, services, formOf(link))).toEqual({
			kind: 'redirect',
			status: 303,
			location: proposeHref('anna', ['ben'])
		});
		expect(payloads).toEqual([expect.objectContaining({ contactId: 'anna', targetId: 'ben' })]);
	});

	it('takes the person from the page, never from the form', async () => {
		const payloads: { contactId: string }[] = [];
		const services = commanding({
			'relationship.add': async (_actor, payload) => {
				payloads.push(payload);
				return { relationshipId: 'r1' };
			}
		});
		await post(actions.addRelationship, services, formOf({ ...link, contactId: 'someone-else' }));
		expect(payloads.map((p) => p.contactId)).toEqual(['anna']);
	});

	it('refuses a form without a person or a type, and adds nothing', async () => {
		expect(await post(actions.addRelationship, {}, formOf({ commandId: COMMAND_ID }))).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: t('errors.relationship.needPersonAndType') }
		});
	});

	it('answers 409 with the reason the use-case refused it for', async () => {
		const services = commanding({
			'relationship.add': async () => {
				throw new DuplicateRelationshipError();
			}
		});
		expect(await post(actions.addRelationship, services, formOf(link))).toEqual({
			kind: 'fail',
			status: 409,
			data: { error: t('errors.relationship.duplicate') }
		});
	});

	it('says it could not add the link while the same command is still being applied', async () => {
		const receipts = inMemoryReceipts();
		await receipts.claim({
			id: COMMAND_ID,
			memberId: viewer.id,
			householdId: viewer.householdId,
			type: 'relationship.add',
			claimedAt: 0
		});
		expect(await post(actions.addRelationship, commanding({}, receipts), formOf(link))).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: t('errors.relationship.couldNotAdd') }
		});
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const services = commanding({
			'relationship.add': async () => {
				throw new Error('disk full');
			}
		});
		await expect(post(actions.addRelationship, services, formOf(link))).rejects.toBeInstanceOf(
			CommandFailedError
		);
	});
});

describe('addRelationships', () => {
	const batch = {
		commandId: COMMAND_ID,
		typeChoice: CHOICE,
		targetId: ['ben', 'cleo'],
		sinceDate: ['2020-01-01', '']
	};

	it('links every picked person and answers the new ids, for one Undo', async () => {
		const payloads: unknown[] = [];
		const services = commanding({
			'relationship.addMany': async (_actor, payload) => {
				payloads.push(payload);
				return { relationshipIds: ['r1', 'r2'] };
			}
		});
		expect(await post(actions.addRelationships, services, formOf(batch))).toEqual({
			kind: 'data',
			data: { relationshipIds: ['r1', 'r2'] }
		});
		expect(payloads).toEqual([
			expect.objectContaining({
				contactId: 'anna',
				links: [
					{ targetId: 'ben', sinceDate: '2020-01-01' },
					{ targetId: 'cleo', sinceDate: null }
				]
			})
		]);
	});

	it('refuses a form whose since fields lost their pairing with the people', async () => {
		const form = formOf({ ...batch, sinceDate: ['2020-01-01'] });
		expect(await post(actions.addRelationships, {}, form)).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: t('errors.relationship.needPersonAndType') }
		});
	});

	it('refuses a form that picked nobody', async () => {
		const form = formOf({ commandId: COMMAND_ID, typeChoice: CHOICE });
		expect(await post(actions.addRelationships, {}, form)).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: t('errors.relationship.needPersonAndType') }
		});
	});

	it('names each refused person, so the form can mark them', async () => {
		const reason = phrase('errors.relationship.duplicate');
		const services = commanding({
			'relationship.addMany': async () => {
				throw new RelationshipsRefusedError([{ targetId: 'cleo', targetName: 'Cleo', reason }]);
			}
		});
		expect(await post(actions.addRelationships, services, formOf(batch))).toEqual({
			kind: 'fail',
			status: 409,
			data: {
				error: t('errors.relationship.refusedFor', { name: 'Cleo', reason: reason(t) }),
				refusals: [{ targetId: 'cleo', reason: reason(t) }]
			}
		});
	});

	it('answers a refusal of the whole batch with no one marked', async () => {
		const services = commanding({
			'relationship.addMany': async () => {
				throw new ContradictoryRelationshipError();
			}
		});
		expect(await post(actions.addRelationships, services, formOf(batch))).toEqual({
			kind: 'fail',
			status: 409,
			data: { error: t('errors.relationship.contradiction'), refusals: [] }
		});
	});

	it('says it could not add the links while the same batch is still being applied', async () => {
		const receipts = inMemoryReceipts();
		await receipts.claim({
			id: COMMAND_ID,
			memberId: viewer.id,
			householdId: viewer.householdId,
			type: 'relationship.addMany',
			claimedAt: 0
		});
		expect(await post(actions.addRelationships, commanding({}, receipts), formOf(batch))).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: t('errors.relationship.couldNotAdd') }
		});
	});
});

describe('removeRelationships', () => {
	it('takes the whole batch back and returns to the card', async () => {
		const removed: string[][] = [];
		const services = relating({
			removeAllVisibleTo: async (_v, ids) => {
				removed.push([...ids]);
				return true;
			}
		});
		const form = formOf({ relationshipId: ['r1', 'r2'] });
		expect(await post(actions.removeRelationships, services, form)).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/contacts/anna#section-relationships'
		});
		expect(removed).toEqual([['r1', 'r2']]);
	});

	it('refuses a post naming no link, or an empty one', async () => {
		for (const form of [formOf({}), formOf({ relationshipId: ['r1', ''] })]) {
			expect(await post(actions.removeRelationships, {}, form)).toEqual({
				kind: 'fail',
				status: 400,
				data: {}
			});
		}
	});

	it('answers 404 when any of them is gone or out of sight', async () => {
		const services = relating({ removeAllVisibleTo: async () => false });
		const form = formOf({ relationshipId: ['r1', 'r2'] });
		expect(await post(actions.removeRelationships, services, form)).toEqual({
			kind: 'fail',
			status: 404,
			data: { error: t('errors.relationship.notFound') }
		});
	});
});

describe('editRelationship', () => {
	const edit = { relationshipId: 'r1', description: 'since school', status: 'former' };
	const saving = (update: RelationshipRepository['updateVisibleTo']) =>
		relating({ updateVisibleTo: update });

	it('saves the specifics and returns to the card', async () => {
		const saved: unknown[] = [];
		const services = saving(async (_v, id, details) => {
			saved.push({ id, details });
			return true;
		});
		expect(await post(actions.editRelationship, services, formOf(edit))).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/contacts/anna#section-relationships'
		});
		expect(saved).toEqual([
			{
				id: 'r1',
				details: expect.objectContaining({
					description: 'since school',
					status: 'former',
					retype: null
				})
			}
		]);
	});

	it('refuses a post naming no link', async () => {
		expect(await post(actions.editRelationship, {}, formOf({ description: 'x' }))).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: t('errors.relationship.couldNotSave') }
		});
	});

	it('refuses a type the picker did not write, and saves nothing', async () => {
		const form = formOf({ ...edit, typeChoice: 'no-separator' });
		expect(await post(actions.editRelationship, {}, form)).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: t('errors.relationship.couldNotSave') }
		});
	});

	it('hands a type the picker wrote on to the use-case, from this page’s side', async () => {
		const asked: string[] = [];
		const services = relating({
			findVisibleTo: async (_v, id) => {
				asked.push(id);
				return null;
			}
		});
		const form = formOf({ ...edit, typeChoice: CHOICE });
		expect(await post(actions.editRelationship, services, form)).toMatchObject({ status: 404 });
		expect(asked).toEqual(['r1']);
	});

	it('answers 404 when the link is gone or out of sight', async () => {
		expect(
			await post(
				actions.editRelationship,
				saving(async () => false),
				formOf(edit)
			)
		).toEqual({ kind: 'fail', status: 404, data: { error: t('errors.relationship.notFound') } });
	});

	it('answers 400 with the reason when the specifics do not hold', async () => {
		const form = formOf({ ...edit, status: 'complicated' });
		expect(
			await post(
				actions.editRelationship,
				saving(async () => true),
				form
			)
		).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: t('errors.relationship.currentOrFormer') }
		});
	});

	const refusals = [
		['a duplicate', new DuplicateRelationshipError(), t('errors.relationship.duplicate')],
		[
			'a contradiction',
			new ContradictoryRelationshipError(),
			t('errors.relationship.contradiction')
		],
		[
			'a type the rules exclude',
			new RelationshipExcludedError({ reason: 'alreadyRomantic', personId: 'ben' }, () => 'Ben'),
			t('errors.relationship.alreadyRomantic', { name: 'Ben' })
		]
	] as const;
	for (const [what, refusal, message] of refusals) {
		it(`answers 409 for ${what}`, async () => {
			const services = saving(async () => {
				throw refusal;
			});
			expect(await post(actions.editRelationship, services, formOf(edit))).toEqual({
				kind: 'fail',
				status: 409,
				data: { error: message }
			});
		});
	}

	it('lets any other failure through', async () => {
		const services = saving(async () => {
			throw new Error('disk full');
		});
		await expect(post(actions.editRelationship, services, formOf(edit))).rejects.toThrow(
			'disk full'
		);
	});
});

describe('removeRelationship', () => {
	it('takes the link back and returns to the card', async () => {
		const services = relating({ removeVisibleTo: async (_v, id) => id === 'r1' });
		expect(
			await post(actions.removeRelationship, services, formOf({ relationshipId: 'r1' }))
		).toEqual({ kind: 'redirect', status: 303, location: '/contacts/anna#section-relationships' });
	});

	it('refuses a post naming no link', async () => {
		expect(await post(actions.removeRelationship, {}, formOf({}))).toEqual({
			kind: 'fail',
			status: 400,
			data: {}
		});
	});

	it('answers 404 when the link is gone or out of sight', async () => {
		const services = relating({ removeVisibleTo: async () => false });
		expect(
			await post(actions.removeRelationship, services, formOf({ relationshipId: 'r1' }))
		).toEqual({ kind: 'fail', status: 404, data: { error: t('errors.relationship.notFound') } });
	});
});

/*
 * The three answers to a suggestion: what `suggestion-answers.ts` decides is its own suite's;
 * here only how the card's actions pass a refusal on and where they go back to.
 */
describe('the answers to a suggestion', () => {
	const PARENT: RelationshipType = {
		id: 'type-parent',
		householdId: null,
		key: PARENT_CHILD_TYPE_KEY,
		forwardLabel: 'parent',
		reverseLabel: 'child',
		category: 'family',
		symmetric: false,
		sortOrder: 0
	};
	const claim = { fromId: 'anna', toId: 'ben', typeId: PARENT.id };
	const answer = { relation: 'parent', fromId: 'anna', toId: 'ben' };
	const kinship = inMemoryKinshipGraph({
		people: ['anna', 'ben'].map((id) => ({ id, displayName: id }))
	});
	const services = {
		people: {
			contactDeps: {
				contacts: { findByIdVisibleTo: async (_v: Viewer, id: string) => ({ id }) as Contact }
			}
		},
		relationships: {
			relationshipDeps: {
				relationships: relationshipRepositoryWith({
					exists: async () => false,
					insert: async () => {}
				}),
				kinship,
				ties: inMemoryRelationshipTies(),
				types: { getType: async () => PARENT },
				ids: { next: () => 'id-1' },
				clock: { now: () => 42 }
			},
			suggestionReviewDeps: {
				kinship,
				dismissals: {
					listForHousehold: async () => [],
					dismiss: async () => {},
					restore: async () => true
				},
				ids: { next: () => 'id-2' },
				clock: { now: () => 42 }
			}
		}
	} satisfies ClaimAnswerServices as unknown as FakeServices;
	const unreadable: EdgeAnswer = {
		kind: 'fail',
		status: 400,
		data: { error: t('errors.relationship.badSuggestion') }
	};

	it('stores an accepted claim and keeps the other suggestions on screen', async () => {
		const form = formOf({ ...claim, propose: 'anna~ben' });
		expect(await post(actions.addProposedRelationship, services, form)).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/contacts/anna?propose=anna~ben#section-relationships'
		});
	});

	it('returns to the card alone when no suggestions were on screen', async () => {
		expect(await post(actions.addProposedRelationship, services, formOf(claim))).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/contacts/anna#section-relationships'
		});
	});

	it('passes a refused acceptance on with its status', async () => {
		expect(await post(actions.addProposedRelationship, {}, formOf({ fromId: 'anna' }))).toEqual(
			unreadable
		);
	});

	it('declines a claim and returns to the review', async () => {
		expect(await post(actions.dismissSuggestion, services, formOf(answer))).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/contacts/anna?review#section-relationships'
		});
	});

	it('passes a refused decline on with its status', async () => {
		expect(await post(actions.dismissSuggestion, {}, formOf({ fromId: 'anna' }))).toEqual(
			unreadable
		);
	});

	it('takes a no back and returns to the review', async () => {
		expect(await post(actions.restoreSuggestion, services, formOf(answer))).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/contacts/anna?review#section-relationships'
		});
	});

	it('passes a refused restore on with its status', async () => {
		expect(await post(actions.restoreSuggestion, {}, formOf({ fromId: 'anna' }))).toEqual(
			unreadable
		);
	});
});
