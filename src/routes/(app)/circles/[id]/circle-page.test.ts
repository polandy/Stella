import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CirclePhoto } from '$lib/server/domain/circles/circle-photos';
import type { NewMembership, RoleRename } from '$lib/server/domain/circles/circles';
import type { SurnameListPerson } from '$lib/server/domain/contacts/last-names';
import type { CircleCutRow } from '$lib/server/domain/media/cuts';
import {
	circleRepositoryWith,
	cutRepositoryWith,
	fixedClock,
	inMemoryCircleMemberships,
	inMemoryKinshipGraph,
	membership,
	sequentialIds,
	someCircle
} from '$lib/server/domain/testing';
import type { Locale } from '$lib/i18n/locales';
import {
	answerOf,
	formOf,
	MEMBER,
	routeEvent,
	type EdgeAnswer,
	type FakeServices
} from '$lib/server/testing';
import { actions, load } from './+page.server';
import type { PageServerData } from './$types';

/*
 * The circle page (docs/02 §2.4.2) as the edge answers it: the circle the address names, its
 * members grouped by role, the people picked to add or re-role, a role renamed, a member taken
 * out — each refusal said in the reader's language, each success back to the page. The photo
 * actions (`actions/photos.test.ts`), the last-name ones (`_shared/last-names-actions.test.ts`)
 * and the use-cases have their own suites; the ports here only answer the way the case needs.
 */

const en = createTranslator('en');
const de = createTranslator('de');
const PAGE = { id: 'k1' };
const NOW = 5000;

/** Where every success lands: the circle's page. */
const BACK: EdgeAnswer = { kind: 'redirect', status: 303, location: '/circles/k1' };

/** The refusal shown above the members, with its status. */
const refused = (status: number, error: string): EdgeAnswer => ({
	kind: 'fail',
	status,
	data: { error }
});

/** A shared photo of the circle, under `role`. */
const photo = (id: string, role: string | null): CirclePhoto => ({
	id,
	circleId: 'k1',
	role,
	caption: null,
	visibility: 'shared',
	createdBy: MEMBER.id,
	createdByName: MEMBER.name,
	width: 2000,
	height: 1500,
	takenAt: null,
	createdAt: 1000,
	pinnedAt: null
});

const listed = (id: string, lastName: string | null): SurnameListPerson => ({
	id,
	displayName: lastName ? `${id} ${lastName}` : id,
	firstName: id,
	lastName,
	nickname: null,
	formerName: null,
	avatarPhotoId: null,
	isDeceased: false,
	archived: false,
	withoutLastNameAt: null
});

/**
 * The choir as the viewer sees it: Anna and Ben sing alto, Cleo tenor, Dora has no role; the
 * household also knows Emil, who is not in it. Markus Brunner's son Ben has no last name yet.
 */
const MEMBERS = [
	membership('k1', 'anna', { role: 'Alto' }),
	membership('k1', 'ben', { role: 'Alto' }),
	membership('k1', 'cleo', { role: 'Tenor' }),
	membership('k1', 'dora')
];

interface Household {
	/** Whether the viewer can see circle k1. */
	circle?: boolean;
	/** Whom the viewer can see in the household, members or not. */
	people?: string[];
	/** Of those, whom the household has archived: seen, but out of the lists it browses. */
	archived?: string[];
	renameRole?: (change: RoleRename) => Promise<void>;
}

/** The circle page's ports over what the viewer sees; the writes are kept for the test. */
function household({
	circle = true,
	people = ['anna', 'ben', 'cleo', 'dora', 'emil'],
	archived = [],
	renameRole
}: Household = {}) {
	const added: NewMembership[] = [];
	const reroled: [string[], string | null][] = [];
	const renamed: RoleRename[] = [];
	const removed: string[] = [];
	const circles = circleRepositoryWith({
		getVisibleTo: async (_viewer, id) => (circle && id === 'k1' ? someCircle('k1', 'Choir') : null),
		addMemberships: async (batch) => void added.push(...batch),
		setRoles: async (_circleId, ids, role) => void reroled.push([[...ids], role]),
		renameRole: renameRole ?? (async (change) => void renamed.push(change)),
		removeMembership: async (_circleId, contactId) => void removed.push(contactId)
	});
	const memberships = inMemoryCircleMemberships(MEMBERS);
	const photos = [photo('p1', 'tenor'), photo('p2', 'Bass')];
	const circlePhotos = { listVisible: async () => photos };
	const cutRows: CircleCutRow[] = [
		{ groupPhotoId: 'p1', contactId: 'anna', crop: null },
		{ groupPhotoId: 'p1', contactId: null, crop: null }
	];
	const surnamePeople = [listed('markus', 'Brunner'), listed('ben', null)];
	const clock = fixedClock(NOW);
	const services: FakeServices = {
		circles: {
			circleDeps: { circles, ids: sequentialIds(), clock },
			circleMembershipDeps: { memberships },
			circlePhotoDeps: { circlePhotos } as never,
			cutDeps: { cuts: cutRepositoryWith({ listCutsOfCircle: async () => cutRows }) } as never,
			memberRoleDeps: { circles, memberships, clock },
			renameRoleDeps: { circles, memberships, circlePhotos, clock },
			memberRemovalDeps: { circles, memberships }
		},
		people: {
			contactNameDeps: {
				contactNames: {
					listNamesAmongVisibleTo: async (_viewer, ids) =>
						ids.filter((id) => people.includes(id)).map((id) => ({ id, displayName: id })),
					listBrowsableNamesAmong: async (_viewer, ids) =>
						ids
							.filter((id) => people.includes(id) && !archived.includes(id))
							.map((id) => ({ id, displayName: id }))
				}
			},
			surnameReviewDeps: {
				surnames: {
					loadSurnameFactsVisibleTo: async () => ({ people: surnamePeople, familyCircles: [] })
				},
				kinship: inMemoryKinshipGraph({
					people: surnamePeople.map(({ id, displayName }) => ({ id, displayName })),
					parentEdges: [{ parentId: 'markus', childId: 'ben' }]
				}),
				surnameDismissals: { listForHousehold: async () => [] }
			}
		}
	};
	return { services, added, reroled, renamed, removed };
}

/** Runs `action` on the choir's page with `form` posted, over `services`. */
type Action = (event: never) => unknown;

const post = (action: Action, services: FakeServices, form: FormData, locale: Locale = 'en') =>
	answerOf(action(routeEvent({ services, params: PAGE, form, locale })));

const open = (services: FakeServices) =>
	answerOf(load(routeEvent<Parameters<typeof load>[0]>({ services, params: PAGE })));

describe('load', () => {
	it('shows the circle with its members under their roles, and what the page offers', async () => {
		const answer = await open(household().services);
		if (answer.kind !== 'data') throw new Error(`answered ${answer.kind}`);
		const data = answer.data as PageServerData;
		expect(data.circle).toMatchObject({ id: 'k1', name: 'Choir' });
		expect(data.memberGroups.map((g) => [g.role, g.members.map((m) => m.contactId)])).toEqual([
			['Alto', ['anna', 'ben']],
			['Tenor', ['cleo']],
			[null, ['dora']]
		]);
		expect(data.roleSuggestions).toEqual(['Alto', 'Tenor']);
		expect(data.memberIds).toEqual(['anna', 'ben', 'cleo', 'dora']);
		expect(data.viewerId).toBe(MEMBER.id);
		// A photo's picker offers the circle's roles, plus its own once nobody has it.
		expect(Object.fromEntries(data.photos.photos.map((p) => [p.id, p.roleOptions]))).toEqual({
			p1: ['Alto', 'Tenor'],
			p2: ['Alto', 'Tenor', 'Bass']
		});
		expect(data.cuts).toEqual({ p1: { people: 2, wearers: [{ contactId: 'anna', crop: null }] } });
		expect(data.passOn).toEqual({ markus: [{ id: 'ben', name: 'ben', declined: [] }] });
	});
});

describe('addMembers', () => {
	it('adds everyone picked under the role and goes back to the page', async () => {
		const { services, added } = household();
		const form = formOf({ contactId: ['emil', 'dora'], role: ' Bass ' });
		expect(await post(actions.addMembers, services, form)).toEqual(BACK);
		expect(added.map((m) => [m.contactId, m.role, m.createdBy])).toEqual([
			['emil', 'Bass', MEMBER.id],
			['dora', 'Bass', MEMBER.id]
		]);
	});

	it('adds without a role when the role is left blank', async () => {
		const { services, added } = household();
		expect(
			await post(actions.addMembers, services, formOf({ contactId: 'emil', role: '' }))
		).toEqual(BACK);
		expect(added.map((m) => m.role)).toEqual([null]);
	});

	it('asks for a person when nobody was picked, and adds nothing', async () => {
		const { services, added } = household();
		for (const form of [formOf({ role: 'Bass' }), formOf({ contactId: '' })]) {
			expect(await post(actions.addMembers, services, form)).toEqual(
				refused(400, en('errors.circle.choosePerson'))
			);
		}
		expect(added).toEqual([]);
	});

	it('refuses the whole pick when one of it is someone the viewer cannot see', async () => {
		const { services, added } = household({ people: ['dora'] });
		const form = formOf({ contactId: ['dora', 'emil'] });
		expect(await post(actions.addMembers, services, form)).toEqual(
			refused(400, en('errors.person.notFound'))
		);
		expect(added).toEqual([]);
	});

	it('adds someone archived as well: archiving tidies the lists, it does not hide', async () => {
		const { services, added } = household({ archived: ['emil'] });
		expect(await post(actions.addMembers, services, formOf({ contactId: 'emil' }))).toEqual(BACK);
		expect(added.map((m) => m.contactId)).toEqual(['emil']);
	});
});

describe('setRole', () => {
	it('gives every member picked the role and goes back to the page', async () => {
		const { services, reroled } = household();
		const form = formOf({ contactId: ['anna', 'dora'], role: 'Soprano' });
		expect(await post(actions.setRole, services, form)).toEqual(BACK);
		expect(reroled).toEqual([[['anna', 'dora'], 'Soprano']]);
	});

	it('takes the role away when it is blank or left out', async () => {
		for (const form of [formOf({ contactId: 'anna', role: '  ' }), formOf({ contactId: 'anna' })]) {
			const { services, reroled } = household();
			expect(await post(actions.setRole, services, form)).toEqual(BACK);
			expect(reroled).toEqual([[['anna'], null]]);
		}
	});

	it('asks for a person when nobody was picked, and writes nothing', async () => {
		const { services, reroled } = household();
		expect(await post(actions.setRole, services, formOf({ role: 'Alto' }))).toEqual(
			refused(400, en('errors.circle.choosePerson'))
		);
		expect(reroled).toEqual([]);
	});

	it('leaves out someone who is not a member the viewer sees, and still goes back', async () => {
		const { services, reroled } = household();
		const form = formOf({ contactId: 'emil', role: 'Alto' });
		expect(await post(actions.setRole, services, form)).toEqual(BACK);
		expect(reroled).toEqual([]);
	});
});

describe('renameRole', () => {
	it('renames the role for everyone who has it and goes back to the page', async () => {
		const { services, renamed } = household();
		const form = formOf({ from: 'alto', role: ' Mezzo ' });
		expect(await post(actions.renameRole, services, form)).toEqual(BACK);
		expect(renamed).toEqual([
			{ circleId: 'k1', contactIds: ['anna', 'ben'], photoIds: [], role: 'Mezzo', updatedAt: NOW }
		]);
	});

	it('asks to check the form when it lacks the role or its new name, in the reader’s words', async () => {
		const { services, renamed } = household();
		for (const [locale, t] of [
			['en', en],
			['de', de]
		] as const) {
			for (const form of [formOf({ role: 'Mezzo' }), formOf({ from: 'Alto' })]) {
				expect(await post(actions.renameRole, services, form, locale)).toEqual(
					refused(400, t('errors.form.checkAndRetry'))
				);
			}
		}
		expect(renamed).toEqual([]);
	});

	it('says a role needs a name under the heading that was renamed, in the reader’s words', async () => {
		for (const [locale, t] of [
			['en', en],
			['de', de]
		] as const) {
			const { services, renamed } = household();
			const form = formOf({ from: 'Alto', role: '   ' });
			expect(await post(actions.renameRole, services, form, locale)).toEqual({
				kind: 'fail',
				status: 400,
				data: { renameError: t('errors.circle.roleNameBlank'), renameFrom: 'Alto' }
			});
			expect(renamed).toEqual([]);
		}
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const { services } = household({
			renameRole: async () => {
				throw new Error('disk full');
			}
		});
		await expect(
			post(actions.renameRole, services, formOf({ from: 'Alto', role: 'Mezzo' }))
		).rejects.toThrow('disk full');
	});
});

describe('removeMember', () => {
	it('takes the member out and goes back to the page', async () => {
		const { services, removed } = household();
		expect(await post(actions.removeMember, services, formOf({ contactId: 'cleo' }))).toEqual(BACK);
		expect(removed).toEqual(['cleo']);
	});

	it('asks to check the form when it names nobody, in the reader’s words', async () => {
		const { services, removed } = household();
		for (const [locale, t] of [
			['en', en],
			['de', de]
		] as const) {
			expect(await post(actions.removeMember, services, formOf({}), locale)).toEqual(
				refused(400, t('errors.form.checkAndRetry'))
			);
		}
		expect(removed).toEqual([]);
	});

	it('answers 404 for someone who is not a member the viewer sees, and removes nothing', async () => {
		const { services, removed } = household();
		expect(await post(actions.removeMember, services, formOf({ contactId: 'emil' }))).toEqual(
			refused(404, en('errors.person.notFound'))
		);
		expect(removed).toEqual([]);
	});
});

/** The page's own actions; the photo and last-name ones are pinned in their own suites. */
const OWN = ['addMembers', 'setRole', 'renameRole', 'removeMember'] as const;

describe('a circle the viewer cannot see', () => {
	it('is not found by the page and every action of its own, which write nothing', async () => {
		const notFound: EdgeAnswer = {
			kind: 'error',
			status: 404,
			message: en('errors.circle.notFound')
		};
		const { services, added, reroled, renamed, removed } = household({ circle: false });
		expect(await open(services)).toEqual(notFound);
		for (const name of OWN) {
			const form = formOf({ contactId: 'anna', from: 'Alto', role: 'Mezzo' });
			expect({ name, answer: await post(actions[name], services, form) }).toEqual({
				name,
				answer: notFound
			});
		}
		expect([added, reroled, renamed, removed].flat()).toEqual([]);
	});
});

describe('a visitor who is not signed in', () => {
	it('is sent to log in by the page and every action of its own, before anything is read', async () => {
		const login: EdgeAnswer = { kind: 'redirect', status: 302, location: '/login' };
		const visit = { services: {}, user: null, params: PAGE } as const;
		expect(await answerOf(load(routeEvent(visit)))).toEqual(login);
		for (const name of OWN) {
			const event = routeEvent<never>({ ...visit, form: formOf({}) });
			expect({ name, answer: await answerOf(actions[name](event)) }).toEqual({
				name,
				answer: login
			});
		}
	});
});
