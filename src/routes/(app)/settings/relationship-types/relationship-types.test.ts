import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { AuthUser } from '$lib/server/auth/accounts';
import { BUILT_IN_RELATIONSHIP_TYPES } from '$lib/server/domain/relationships/built-in-types';
import {
	CUSTOM_TYPE_SORT_ORDER,
	type NewRelationshipType,
	type RelationshipTypeFields
} from '$lib/server/domain/relationships/relationship-types';
import type { RelationshipType } from '$lib/server/domain/relationships/relationships';
import { relationshipTypeRepositoryWith, sequentialIds } from '$lib/server/domain/testing';
import {
	answerOf,
	formOf,
	MEMBER,
	routeEvent,
	type EdgeAnswer,
	type FakeServices
} from '$lib/server/testing';
import type { Locale } from '$lib/i18n/locales';
import { actions, load } from './+page.server';

/*
 * The household's relationship vocabulary (docs/02 §2.4) as the edge answers it: admin only, the
 * form read, a type that is gone, a refusal of the use-case said in the reader's language, and a
 * success that sends the page back to itself. The use-cases have their own suite
 * (`relationship-types.test.ts` in the domain); the port here only answers the way the case needs.
 */

const ADMIN: AuthUser = { ...MEMBER, id: 'a1', role: 'admin', name: 'Admin' };
const en = createTranslator('en');
const de = createTranslator('de');

/** Where every success lands: the page, reloaded. */
const BACK: EdgeAnswer = {
	kind: 'redirect',
	status: 303,
	location: '/settings/relationship-types'
};

/** The 400 or 404 an action answers with the sentence above the form. */
const refused = (status: number, error: unknown): EdgeAnswer => ({
	kind: 'fail',
	status,
	data: { error }
});

/** A refusal of a form the page would never post, in the reader's language. */
const unreadable = (locale: Locale = 'en') =>
	refused(400, createTranslator(locale)('errors.form.checkAndRetry'));

const custom = (
	id: string,
	forwardLabel: string,
	fields: Partial<RelationshipType> = {}
): RelationshipType => ({
	id,
	householdId: 'h1',
	key: id,
	forwardLabel,
	reverseLabel: forwardLabel,
	category: 'social',
	symmetric: true,
	sortOrder: CUSTOM_TYPE_SORT_ORDER,
	...fields
});

const builtIn = (id: string): RelationshipType => {
	const found = BUILT_IN_RELATIONSHIP_TYPES.find((type) => type.id === id);
	if (!found) throw new Error(`no built-in type ${id}`);
	return found;
};

const COUSIN = builtIn('cousin');
const AUNT = builtIn('aunt_uncle_niece_nephew');
const CHOIR = custom('choir', 'Sings with');
const LANDLORD = custom('landlord', 'Landlord of', { reverseLabel: 'Tenant of', symmetric: false });
/** The *Cousin* an older Monica import created before Stella had it built in. */
const IMPORTED_COUSIN = custom('monica:reltype:cousin', 'Cousin');

interface Household {
	types?: RelationshipType[];
	/** How many relationships are stored under each type; none unless named. */
	usage?: Record<string, number>;
	/** Whether a write still finds its type, as it would unless someone removed it meanwhile. */
	found?: boolean;
	/** What the store throws on every write: a breakage of ours. */
	breakage?: Error;
}

/** The vocabulary's port over the household's types; the writes are kept for the test. */
function household({
	types = [COUSIN, AUNT, CHOIR, LANDLORD, IMPORTED_COUSIN],
	usage = {},
	found = true,
	breakage
}: Household = {}) {
	const inserted: NewRelationshipType[] = [];
	const updated: [string, RelationshipTypeFields][] = [];
	const deleted: string[] = [];
	const merged: [string, string][] = [];
	const write = <T>(record: () => T) => {
		if (breakage) throw breakage;
		return record();
	};
	const relationshipTypes = relationshipTypeRepositoryWith({
		listTypes: async () => types,
		getType: async (_viewer, id) => types.find((type) => type.id === id) ?? null,
		insertType: async (type) => write(() => void inserted.push(type)),
		updateTypeVisibleTo: async (_viewer, id, fields) =>
			write(() => found && (updated.push([id, fields]), true)),
		deleteTypeVisibleTo: async (_viewer, id) => write(() => found && (deleted.push(id), true)),
		countRelationshipsOfType: async (_viewer, id) => usage[id] ?? 0,
		mergeTypeInto: async (_viewer, fromId, intoId) =>
			write(() => found && (merged.push([fromId, intoId]), true))
	});
	const services: FakeServices = {
		relationships: {
			relationshipTypes,
			relationshipTypeUsage: {
				countRelationshipsByType: async () => new Map(Object.entries(usage))
			},
			relationshipTypeDeps: { types: relationshipTypes, ids: sequentialIds('t-new') }
		}
	};
	return { services, writes: { inserted, updated, deleted, merged } };
}

type Action = (event: never) => unknown;

/** Runs `action` as the admin with `form` posted, over `services`. */
const post = (action: Action, services: FakeServices, form: FormData, locale: Locale = 'en') =>
	answerOf(action(routeEvent({ services, user: ADMIN, locale, form })));

describe('load', () => {
	it('lists the built-in types apart from the household’s, each of its own with what it may do', async () => {
		const { services } = household({ usage: { landlord: 2 } });
		const answer = await answerOf(load(routeEvent({ services, user: ADMIN })));
		expect(answer).toEqual({
			kind: 'data',
			data: {
				builtIn: [COUSIN, AUNT],
				custom: [
					{ ...CHOIR, usageCount: 0, replacedBy: null, mergeTargets: [COUSIN, IMPORTED_COUSIN] },
					{ ...LANDLORD, usageCount: 2, replacedBy: null, mergeTargets: [AUNT] },
					{
						...IMPORTED_COUSIN,
						usageCount: 0,
						replacedBy: 'cousin',
						mergeTargets: [COUSIN, CHOIR]
					}
				]
			}
		});
	});
});

describe('add', () => {
	const choirMate = { forwardLabel: '  Choir mate  ', category: 'social', symmetric: 'on' };

	it('adds the type for the household and goes back to the list', async () => {
		const { services, writes } = household();
		expect(await post(actions.add, services, formOf(choirMate))).toEqual(BACK);
		expect(writes.inserted).toEqual([
			{
				id: 't-new',
				householdId: 'h1',
				key: 'choir_mate',
				forwardLabel: 'Choir mate',
				reverseLabel: 'Choir mate',
				category: 'social',
				symmetric: true,
				sortOrder: CUSTOM_TYPE_SORT_ORDER
			}
		]);
	});

	it('reads a form without the checkbox as a one-way type with both labels', async () => {
		const { services, writes } = household();
		const form = formOf({
			forwardLabel: 'Coach of',
			reverseLabel: 'Coached by',
			category: 'professional'
		});
		expect(await post(actions.add, services, form)).toEqual(BACK);
		expect(
			writes.inserted.map(({ reverseLabel, symmetric }) => ({ reverseLabel, symmetric }))
		).toEqual([{ reverseLabel: 'Coached by', symmetric: false }]);
	});

	it('refuses a blank label in the reader’s language, and writes nothing', async () => {
		const { services, writes } = household();
		const form = formOf({ ...choirMate, forwardLabel: '   ' });
		expect(await post(actions.add, services, form)).toEqual(
			refused(400, en('errors.relationshipType.needsLabel'))
		);
		expect(await post(actions.add, services, form, 'de')).toEqual(
			refused(400, de('errors.relationshipType.needsLabel'))
		);
		expect(writes.inserted).toEqual([]);
	});

	it('refuses a category it does not know, in the reader’s language', async () => {
		const form = formOf({ ...choirMate, category: 'enemy' });
		for (const [locale, say] of [
			['en', en],
			['de', de]
		] as const) {
			expect(await post(actions.add, household().services, form, locale)).toEqual(
				refused(400, say('errors.relationshipType.unknownCategory', { category: 'enemy' }))
			);
		}
	});

	it('refuses a checkbox it does not know, or a form without the label, in the reader’s language', async () => {
		for (const form of [
			formOf({ ...choirMate, symmetric: 'yes' }),
			formOf({ category: 'social' })
		]) {
			expect(await post(actions.add, household().services, form)).toEqual(unreadable());
			expect(await post(actions.add, household().services, form, 'de')).toEqual(unreadable('de'));
		}
	});

	it('says why the use-case refused, in the reader’s language', async () => {
		const taken = formOf({ ...choirMate, forwardLabel: 'Sings with' });
		expect(await post(actions.add, household().services, taken)).toEqual(
			refused(400, en('errors.relationshipType.taken', { label: 'Sings with' }))
		);
		expect(await post(actions.add, household().services, taken, 'de')).toEqual(
			refused(400, de('errors.relationshipType.taken', { label: 'Sings with' }))
		);
		const oneWay = formOf({ forwardLabel: 'Coach of', category: 'professional' });
		expect(await post(actions.add, household().services, oneWay)).toEqual(
			refused(400, en('errors.relationshipType.needsBothLabels'))
		);
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const { services } = household({ breakage: new Error('disk full') });
		await expect(post(actions.add, services, formOf(choirMate))).rejects.toThrow('disk full');
	});
});

describe('edit', () => {
	const rename = {
		typeId: 'choir',
		forwardLabel: 'Sang with',
		category: 'social',
		symmetric: 'on'
	};

	it('rewrites the type and goes back to the list', async () => {
		const { services, writes } = household();
		expect(await post(actions.edit, services, formOf(rename))).toEqual(BACK);
		expect(writes.updated).toEqual([
			[
				'choir',
				{
					forwardLabel: 'Sang with',
					reverseLabel: 'Sang with',
					category: 'social',
					symmetric: true
				}
			]
		]);
	});

	it('refuses a form without the type or the label', async () => {
		const { typeId: _, ...noType } = rename;
		for (const form of [formOf(noType), formOf({ ...rename, typeId: '' })]) {
			expect(await post(actions.edit, household().services, form)).toEqual(unreadable());
			expect(await post(actions.edit, household().services, form, 'de')).toEqual(unreadable('de'));
		}
		const blank = formOf({ ...rename, forwardLabel: '' });
		expect(await post(actions.edit, household().services, blank)).toEqual(
			refused(400, en('errors.relationshipType.needsLabel'))
		);
		expect(await post(actions.edit, household().services, blank, 'de')).toEqual(
			refused(400, de('errors.relationshipType.needsLabel'))
		);
	});

	it('answers 404 for a type that is gone, or goes while it is rewritten', async () => {
		const gone = refused(404, en('errors.relationshipType.gone'));
		const missing = formOf({ ...rename, typeId: 'nope' });
		expect(await post(actions.edit, household().services, missing)).toEqual(gone);
		const { services, writes } = household({ found: false });
		expect(await post(actions.edit, services, formOf(rename))).toEqual(gone);
		expect(writes.updated).toEqual([]);
	});

	it('says gone in the reader’s language', async () => {
		const missing = formOf({ ...rename, typeId: 'nope' });
		expect(await post(actions.edit, household().services, missing, 'de')).toEqual(
			refused(404, de('errors.relationshipType.gone'))
		);
	});

	it('refuses a built-in type, a name already read, and a flip of a type in use', async () => {
		const { services, writes } = household({ usage: { choir: 3 } });
		const cases: [Record<string, string>, string][] = [
			[{ ...rename, typeId: 'cousin' }, en('errors.relationshipType.builtIn')],
			[
				{ ...rename, forwardLabel: 'Landlord of' },
				en('errors.relationshipType.taken', { label: 'Landlord of' })
			],
			[
				{
					typeId: 'choir',
					forwardLabel: 'Sings with',
					reverseLabel: 'Sung with by',
					category: 'social'
				},
				en('errors.relationshipType.inUse', { count: 3 })
			]
		];
		for (const [fields, sentence] of cases) {
			expect(await post(actions.edit, services, formOf(fields))).toEqual(refused(400, sentence));
		}
		expect(writes.updated).toEqual([]);
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const { services } = household({ breakage: new Error('disk full') });
		await expect(post(actions.edit, services, formOf(rename))).rejects.toThrow('disk full');
	});
});

describe('merge', () => {
	const fold = { typeId: 'monica:reltype:cousin', intoId: 'cousin' };

	it('folds the type into the other and goes back to the list', async () => {
		const { services, writes } = household();
		expect(await post(actions.merge, services, formOf(fold))).toEqual(BACK);
		expect(writes.merged).toEqual([['monica:reltype:cousin', 'cousin']]);
	});

	it('refuses a form without either type', async () => {
		for (const form of [
			formOf({ typeId: fold.typeId }),
			formOf({ intoId: fold.intoId }),
			formOf({ ...fold, intoId: '' })
		]) {
			expect(await post(actions.merge, household().services, form)).toEqual(unreadable());
			expect(await post(actions.merge, household().services, form, 'de')).toEqual(unreadable('de'));
		}
	});

	it('answers 404 when either type is gone, or goes while it is folded', async () => {
		const gone = refused(404, en('errors.relationshipType.gone'));
		for (const form of [formOf({ ...fold, typeId: 'nope' }), formOf({ ...fold, intoId: 'nope' })]) {
			expect(await post(actions.merge, household().services, form)).toEqual(gone);
		}
		const { services, writes } = household({ found: false });
		expect(await post(actions.merge, services, formOf(fold))).toEqual(gone);
		expect(writes.merged).toEqual([]);
	});

	it('refuses to fold a built-in type, a type into itself, or across shapes', async () => {
		const { services, writes } = household();
		const cases: [Record<string, string>, string][] = [
			[{ typeId: 'cousin', intoId: 'choir' }, en('errors.relationshipType.builtIn')],
			[{ typeId: 'choir', intoId: 'choir' }, en('errors.relationshipType.mergeIntoItself')],
			[{ typeId: 'landlord', intoId: 'choir' }, en('errors.relationshipType.mergeShape')]
		];
		for (const [fields, sentence] of cases) {
			expect(await post(actions.merge, services, formOf(fields))).toEqual(refused(400, sentence));
		}
		expect(writes.merged).toEqual([]);
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const { services } = household({ breakage: new Error('disk full') });
		await expect(post(actions.merge, services, formOf(fold))).rejects.toThrow('disk full');
	});
});

describe('remove', () => {
	it('removes an unused type of the household and goes back to the list', async () => {
		const { services, writes } = household();
		expect(await post(actions.remove, services, formOf({ typeId: 'choir' }))).toEqual(BACK);
		expect(writes.deleted).toEqual(['choir']);
	});

	it('refuses a form without the type', async () => {
		for (const form of [formOf({}), formOf({ typeId: '' })]) {
			expect(await post(actions.remove, household().services, form)).toEqual(unreadable());
			expect(await post(actions.remove, household().services, form, 'de')).toEqual(
				unreadable('de')
			);
		}
	});

	it('refuses a type still in use, or a built-in one, and removes nothing', async () => {
		const { services, writes } = household({ usage: { choir: 2 } });
		expect(await post(actions.remove, services, formOf({ typeId: 'choir' }))).toEqual(
			refused(400, en('errors.relationshipType.inUse', { count: 2 }))
		);
		expect(await post(actions.remove, services, formOf({ typeId: 'cousin' }))).toEqual(
			refused(400, en('errors.relationshipType.builtIn'))
		);
		expect(writes.deleted).toEqual([]);
	});

	it('answers 404 for a type that is gone, or goes while it is removed', async () => {
		const missing = formOf({ typeId: 'nope' });
		expect(await post(actions.remove, household().services, missing)).toEqual(
			refused(404, en('errors.relationshipType.gone'))
		);
		expect(await post(actions.remove, household().services, missing, 'de')).toEqual(
			refused(404, de('errors.relationshipType.gone'))
		);
		const { services, writes } = household({ found: false });
		expect(await post(actions.remove, services, formOf({ typeId: 'choir' }))).toEqual(
			refused(404, en('errors.relationshipType.gone'))
		);
		expect(writes.deleted).toEqual([]);
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const { services } = household({ breakage: new Error('disk full') });
		await expect(post(actions.remove, services, formOf({ typeId: 'choir' }))).rejects.toThrow(
			'disk full'
		);
	});
});

const edges: [string, Action][] = [['load', load as Action], ...Object.entries(actions)];

describe('a member who is not an admin', () => {
	it('is refused by the page and every action, before anything is read', async () => {
		for (const [name, edge] of edges) {
			const event = routeEvent<never>({ services: {}, user: MEMBER, form: formOf({}) });
			expect({ name, answer: await answerOf(edge(event)) }).toEqual({
				name,
				answer: { kind: 'error', status: 403, message: 'Only an admin can do this.' }
			});
		}
	});
});

describe('a visitor who is not signed in', () => {
	it('is sent to log in by the page and every action, before anything is read', async () => {
		for (const [name, edge] of edges) {
			const event = routeEvent<never>({ services: {}, user: null, form: formOf({}) });
			expect({ name, answer: await answerOf(edge(event)) }).toEqual({
				name,
				answer: { kind: 'redirect', status: 302, location: '/login' }
			});
		}
	});
});
