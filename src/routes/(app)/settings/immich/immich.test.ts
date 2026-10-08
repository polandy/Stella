import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { ImmichFailure, ImmichGateway } from '$lib/server/domain/immich/gateway';
import type { ImmichIgnore } from '$lib/server/domain/immich/ignores';
import type { ImmichLink } from '$lib/server/domain/immich/links';
import type { ImmichNameIgnore } from '$lib/server/domain/immich/name-ignores';
import type { ImmichServices } from '$lib/server/services/immich';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import { contactRepositoryWith, fixedClock, sequentialIds } from '$lib/server/domain/testing';
import {
	answerOf,
	formOf,
	MEMBER,
	routeEvent,
	type EdgeAnswer,
	type FakeServices
} from '$lib/server/testing';
import { actions, load } from './+page.server';

/*
 * *Settings → Immich → Find your people* (docs/02 §2.24.7) as the edge answers it: the page
 * exists only with Immich, a post that is not from the page is refused, a refusal is said on the
 * row it was made on, and anything else is ours. The use-cases have their own suites; the
 * household here is just enough Immich for each case.
 */

const t = createTranslator('en');
const ANNA_FACE = '00000000-0000-4000-8000-00000000000a';
const BEN_FACE = '00000000-0000-4000-8000-00000000000b';
const NEW_FACE = '00000000-0000-4000-8000-00000000000c';

/** A household's Immich: who is shown, which faces are linked to whom, which Immich knows. */
function household(
	people: Record<string, string> = { anna: 'Anna', ben: 'Ben' },
	linked: Record<string, string> = {},
	/** A store that breaks on every read and write, as a full disk would. */
	broken = false
) {
	const ours = () => {
		if (broken) throw new Error('disk full');
	};
	const saved: ImmichLink[] = [];
	const ignored: ImmichIgnore[] = [];
	const unignored: string[] = [];
	const nameIgnored: ImmichNameIgnore[] = [];
	const proposedAgain: string[] = [];
	const known = [ANNA_FACE, BEN_FACE, NEW_FACE];
	const contacts = {
		findByIdVisibleTo: async (_v: unknown, id: string) => {
			ours();
			return people[id] ? { displayName: people[id]!, visibility: 'shared' as const } : null;
		}
	};
	const links = {
		findForContactVisibleTo: async (_v: unknown, contactId: string) => {
			ours();
			return linked[contactId]
				? { contactId, immichPersonId: linked[contactId]!, linkedBy: 'u1', linkedAt: 0 }
				: null;
		},
		linkedContactIdsVisibleTo: async () => new Set(Object.keys(linked)),
		holdersOf: async (_v: unknown, personIds: readonly string[]) => {
			ours();
			return new Map(
				personIds.flatMap((personId) => {
					const holder = Object.keys(linked).find((id) => linked[id] === personId);
					return holder ? [[personId, { contactId: holder, name: people[holder] ?? null }]] : [];
				})
			);
		},
		save: async (link: ImmichLink) => {
			saved.push(link);
			linked[link.contactId] = link.immichPersonId;
			return 'saved' as const;
		},
		remove: async () => false
	};
	const gateway = {
		person: async (id: string) =>
			known.includes(id)
				? { ok: true as const, value: { id, name: 'Face', hidden: false } }
				: { ok: false as const, failure: 'notFound' as const }
	} as unknown as ImmichGateway;
	const clock = fixedClock(1_000);
	const ids = sequentialIds();
	const linkDeps = { links, contacts, gateway, clock, ids };
	const immich: Partial<ImmichServices> = {
		immichLinkDeps: linkDeps,
		addFromImmichDeps: {
			...linkDeps,
			addContact: async (_adder, input) => {
				const name = input.firstName ?? '';
				const id = `new-${name.toLowerCase()}`;
				people[id] = name;
				return id;
			}
		},
		immichIgnoreDeps: {
			contacts,
			clock,
			ignores: {
				listVisibleTo: async () => ignored,
				save: async (pairs) => void ignored.push(...pairs),
				remove: async (_v, contactId, personId) => {
					unignored.push(`${contactId}:${personId}`);
					return true;
				}
			}
		},
		immichNameIgnoreDeps: {
			clock,
			nameIgnores: {
				listForHousehold: async () => nameIgnored,
				save: async (ignore) => {
					ours();
					nameIgnored.push(ignore);
				},
				remove: async (_v, personId) => {
					proposedAgain.push(personId);
					return true;
				}
			}
		},
		signer: { sign: async () => 'signed', verify: async () => ({ ok: false }) } as never
	};
	const services: FakeServices = {
		immich,
		people: {
			contactDeps: {
				contacts: contactRepositoryWith({
					findByIdVisibleTo: async (_v, id) =>
						people[id] ? ({ id, displayName: people[id] } as Contact) : null
				})
			}
		} as FakeServices['people']
	};
	return { services, saved, ignored, unignored, nameIgnored, proposedAgain };
}

const WITHOUT_IMMICH: FakeServices = { immich: null };

type ActionName = keyof typeof actions;
const post = (action: ActionName, services: FakeServices, form: FormData) =>
	answerOf(actions[action]!(routeEvent({ services, form })));

const notFound: EdgeAnswer = { kind: 'error', status: 404, message: t('errors.notFound') };
const checkAndRetry: EdgeAnswer = {
	kind: 'error',
	status: 400,
	message: t('errors.form.checkAndRetry')
};

describe('without Immich', () => {
	it('the page does not exist', async () => {
		expect(await answerOf(load(routeEvent({ services: WITHOUT_IMMICH }) as never))).toEqual(
			notFound
		);
	});

	const everyAction = Object.keys(actions) as ActionName[];
	for (const action of everyAction) {
		it(`${action} answers 404`, async () => {
			expect(await post(action, WITHOUT_IMMICH, formOf({}))).toEqual(notFound);
		});
	}
});

describe('load', () => {
	/** Immich's people list answering `failure`, or an empty list. */
	function matching(failure: ImmichFailure | null, ignores: ImmichIgnore[] = []) {
		const gateway = {
			listPeople: async () =>
				failure
					? { ok: false as const, failure }
					: { ok: true as const, value: { people: [], hasNextPage: false } },
			personStatistics: async () => ({ ok: false as const, failure: 'notFound' as const })
		};
		return {
			immich: {
				immichMatchingDeps: {
					gateway,
					links: {
						holdersOf: async () => new Map(),
						linkedContactIdsVisibleTo: async () => new Set()
					},
					ignores: { listVisibleTo: async () => ignores },
					nameIgnores: {
						listForHousehold: async () => [
							{ householdId: 'h1', immichPersonId: NEW_FACE, ignoredBy: 'gone', ignoredAt: 2 }
						]
					},
					directory: {
						listVisibleTo: async () => [
							{
								id: 'anna',
								displayName: 'Anna',
								firstName: 'Anna',
								lastName: null,
								nickname: null,
								avatarPhotoId: null,
								description: null
							}
						]
					},
					contextReads: {
						listTiesOfVisibleTo: async () => [],
						listMembershipsOfVisibleTo: async () => []
					},
					signer: { sign: async () => 'signed', verify: async () => ({ ok: false }) },
					publicUrl: 'https://immich.test'
				}
			},
			household: {
				memberDeps: {
					members: { listMembers: async () => [{ id: 'u2', name: 'Bea' }] }
				}
			}
		} as unknown as FakeServices;
	}
	const matchesOf = async (services: FakeServices) => {
		const answer = await answerOf(load(routeEvent({ services }) as never));
		return (answer as { data: { matches: Promise<unknown> } }).data.matches;
	};

	it('names who ignored each pair and each face, and nobody for a former member', async () => {
		const ignore = { contactId: 'anna', immichPersonId: ANNA_FACE, ignoredBy: 'u2', ignoredAt: 1 };
		expect(await matchesOf(matching(null, [ignore]))).toMatchObject({
			rows: [],
			ignored: [{ contact: { id: 'anna' }, personId: ANNA_FACE, ignoredByName: 'Bea' }],
			newcomers: [],
			ignoredNewcomers: [{ personId: NEW_FACE, ignoredByName: null }],
			error: null
		});
	});

	const failures = [
		['unauthorized', 'immich.error.keyRejected'],
		['forbidden', 'immich.settings.scope.person.read'],
		['notFound', 'immich.error.unreachable'],
		['unreachable', 'immich.error.unreachable']
	] as const;
	for (const [failure, key] of failures) {
		it(`says why Immich gave no list when it answers ${failure}`, async () => {
			expect(await matchesOf(matching(failure))).toEqual({
				rows: [],
				ignored: [],
				newcomers: [],
				ignoredNewcomers: [],
				error: t(key)
			});
		});
	}
});

describe('link and linkAll', () => {
	const pairs = formOf({ contactId: ['anna', 'ben'], immichPersonId: [ANNA_FACE, BEN_FACE] });

	for (const action of ['link', 'linkAll'] as const) {
		it(`${action} links every confirmed pair`, async () => {
			const h = household();
			expect(await post(action, h.services, pairs)).toEqual({
				kind: 'data',
				data: { linked: ['anna', 'ben'], refused: [], error: null }
			});
			expect(h.saved.map((link) => link.contactId)).toEqual(['anna', 'ben']);
		});
	}

	it('says, per row, why a pair was refused, and links the rest', async () => {
		const h = household({ anna: 'Anna', ben: 'Ben' }, { ben: NEW_FACE });
		expect(await post('linkAll', h.services, pairs)).toEqual({
			kind: 'data',
			data: {
				linked: ['anna'],
				refused: [{ contactId: 'ben', message: t('immich.error.contactLinked', { name: 'Ben' }) }],
				error: null
			}
		});
	});

	it('refuses a post that is not a list of pairs, and links nothing', async () => {
		const h = household();
		expect(await post('link', h.services, formOf({ contactId: 'anna' }))).toEqual({
			kind: 'fail',
			status: 400,
			data: { linked: [], refused: [], error: t('errors.notFound') }
		});
		expect(h.saved).toEqual([]);
	});
});

describe('ignore', () => {
	const row = formOf({ contactId: 'anna', immichPersonId: [ANNA_FACE, BEN_FACE] });

	it('ignores the contact with every face its row showed', async () => {
		const h = household();
		expect(await post('ignore', h.services, row)).toEqual({
			kind: 'data',
			data: { linked: [], refused: [], error: null }
		});
		expect(h.ignored.map((pair) => pair.immichPersonId)).toEqual([ANNA_FACE, BEN_FACE]);
	});

	it('refuses a row without a contact', async () => {
		const h = household();
		expect(await post('ignore', h.services, formOf({ immichPersonId: ANNA_FACE }))).toEqual({
			kind: 'fail',
			status: 400,
			data: { linked: [], refused: [], error: t('errors.notFound') }
		});
	});

	it('says so when the person is gone or out of sight', async () => {
		const h = household({});
		expect(await post('ignore', h.services, row)).toEqual({
			kind: 'fail',
			status: 400,
			data: { linked: [], refused: [], error: t('errors.contact.notFound') }
		});
		expect(h.ignored).toEqual([]);
	});

	it('says so when a face is not one Immich could have shown', async () => {
		const h = household();
		const form = formOf({ contactId: 'anna', immichPersonId: 'not-a-face' });
		expect(await post('ignore', h.services, form)).toEqual({
			kind: 'fail',
			status: 400,
			data: { linked: [], refused: [], error: t('immich.error.personGone') }
		});
	});
});

describe('proposeAgain', () => {
	it('forgets that the pair was ignored', async () => {
		const h = household();
		const form = formOf({ contactId: 'anna', immichPersonId: ANNA_FACE });
		expect(await post('proposeAgain', h.services, form)).toEqual({
			kind: 'data',
			data: { linked: [], refused: [], error: null }
		});
		expect(h.unignored).toEqual([`anna:${ANNA_FACE}`]);
	});

	it('refuses a post naming other than exactly one face', async () => {
		const h = household();
		for (const faces of [[], [ANNA_FACE, BEN_FACE]]) {
			const form = formOf({ contactId: 'anna', immichPersonId: faces });
			expect(await post('proposeAgain', h.services, form)).toEqual({
				kind: 'fail',
				status: 400,
				data: { linked: [], refused: [], error: t('errors.notFound') }
			});
		}
		expect(h.unignored).toEqual([]);
	});
});

describe('assignNewcomer', () => {
	it('gives the face to someone already here, and names them', async () => {
		const h = household();
		const form = formOf({ immichPersonId: NEW_FACE, contactId: 'anna' });
		expect(await post('assignNewcomer', h.services, form)).toEqual({
			kind: 'data',
			data: { assigned: { personId: NEW_FACE, contactId: 'anna', name: 'Anna' } }
		});
	});

	it('asks before replacing the face the person is linked to', async () => {
		const h = household({ anna: 'Anna' }, { anna: ANNA_FACE });
		const form = formOf({ immichPersonId: NEW_FACE, contactId: 'anna' });
		expect(await post('assignNewcomer', h.services, form)).toEqual({
			kind: 'fail',
			status: 400,
			data: {
				newcomer: NEW_FACE,
				newcomerError: t('immich.error.contactLinked', { name: 'Anna' }),
				wouldReplace: 'anna'
			}
		});
		expect(h.saved).toEqual([]);
	});

	it('replaces it once the member confirmed', async () => {
		const h = household({ anna: 'Anna' }, { anna: ANNA_FACE });
		const form = formOf({ immichPersonId: NEW_FACE, contactId: 'anna', replace: '1' });
		expect(await post('assignNewcomer', h.services, form)).toMatchObject({ kind: 'data' });
		expect(h.saved.map((link) => link.immichPersonId)).toEqual([NEW_FACE]);
	});

	it('refuses, without asking, a face someone else holds', async () => {
		const h = household({ anna: 'Anna', ben: 'Ben' }, { ben: NEW_FACE });
		const form = formOf({ immichPersonId: NEW_FACE, contactId: 'anna' });
		expect(await post('assignNewcomer', h.services, form)).toEqual({
			kind: 'fail',
			status: 400,
			data: {
				newcomer: NEW_FACE,
				newcomerError: t('immich.error.linkedTo', { name: 'Ben' }),
				wouldReplace: null
			}
		});
	});

	it('refuses a person gone or out of sight', async () => {
		const h = household({});
		const form = formOf({ immichPersonId: NEW_FACE, contactId: 'anna' });
		expect(await post('assignNewcomer', h.services, form)).toMatchObject({
			kind: 'fail',
			data: { newcomerError: t('errors.contact.notFound'), wouldReplace: null }
		});
	});

	it('refuses a form without the face or the person', async () => {
		const h = household();
		expect(await post('assignNewcomer', h.services, formOf({ contactId: 'anna' }))).toEqual(
			checkAndRetry
		);
		expect(await post('assignNewcomer', h.services, formOf({ immichPersonId: NEW_FACE }))).toEqual(
			checkAndRetry
		);
	});
});

describe('addNewcomer', () => {
	it('adds a person from the face, linked, with the face signed for their photo', async () => {
		const h = household();
		const form = formOf({
			immichPersonId: NEW_FACE,
			firstName: 'Cleo',
			lastName: 'Lind',
			usePhoto: 'on'
		});
		expect(await post('addNewcomer', h.services, form)).toEqual({
			kind: 'data',
			data: {
				added: {
					personId: NEW_FACE,
					contactId: 'new-cleo',
					name: 'Cleo',
					faceUrl: expect.stringContaining('signed')
				}
			}
		});
		expect(h.saved.map((link) => [link.contactId, link.immichPersonId])).toEqual([
			['new-cleo', NEW_FACE]
		]);
	});

	it('leaves the photo out without the tick', async () => {
		const h = household();
		const form = formOf({ immichPersonId: NEW_FACE, firstName: 'Cleo', lastName: 'Lind' });
		expect(await post('addNewcomer', h.services, form)).toMatchObject({
			data: { added: { faceUrl: null } }
		});
	});

	it('says why the face could not be added, on its row', async () => {
		const h = household({ ben: 'Ben' }, { ben: NEW_FACE });
		const form = formOf({ immichPersonId: NEW_FACE, firstName: 'Cleo' });
		expect(await post('addNewcomer', h.services, form)).toEqual({
			kind: 'fail',
			status: 400,
			data: {
				newcomer: NEW_FACE,
				newcomerError: t('immich.error.linkedTo', { name: 'Ben' }),
				wouldReplace: null
			}
		});
	});

	it('refuses a form without a face', async () => {
		const h = household();
		expect(await post('addNewcomer', h.services, formOf({ firstName: 'Cleo' }))).toEqual(
			checkAndRetry
		);
	});
});

describe('ignoreNewcomer', () => {
	it('ignores the face for the whole household', async () => {
		const h = household();
		expect(await post('ignoreNewcomer', h.services, formOf({ immichPersonId: NEW_FACE }))).toEqual({
			kind: 'data',
			data: { ignoredNewcomer: NEW_FACE }
		});
		expect(h.nameIgnored).toMatchObject([{ immichPersonId: NEW_FACE, ignoredBy: MEMBER.id }]);
	});

	it('says so for a face Immich could not have shown', async () => {
		const h = household();
		expect(
			await post('ignoreNewcomer', h.services, formOf({ immichPersonId: 'not-a-face' }))
		).toEqual({
			kind: 'fail',
			status: 400,
			data: {
				newcomer: 'not-a-face',
				newcomerError: t('immich.error.personGone'),
				wouldReplace: null
			}
		});
	});

	it('refuses a form without a face', async () => {
		expect(await post('ignoreNewcomer', household().services, formOf({}))).toEqual(checkAndRetry);
	});
});

describe('proposeNewcomerAgain', () => {
	it('proposes an ignored face again', async () => {
		const h = household();
		const form = formOf({ immichPersonId: NEW_FACE });
		expect(await post('proposeNewcomerAgain', h.services, form)).toEqual({
			kind: 'data',
			data: { proposedAgain: NEW_FACE }
		});
		expect(h.proposedAgain).toEqual([NEW_FACE]);
	});

	it('refuses a form without a face', async () => {
		expect(await post('proposeNewcomerAgain', household().services, formOf({}))).toEqual(
			checkAndRetry
		);
	});
});

describe('a failure of ours', () => {
	const broken = household({ anna: 'Anna' }, {}, true).services;
	const posts = [
		['ignore', formOf({ contactId: 'anna', immichPersonId: ANNA_FACE })],
		['assignNewcomer', formOf({ immichPersonId: NEW_FACE, contactId: 'anna' })],
		['addNewcomer', formOf({ immichPersonId: NEW_FACE, firstName: 'Cleo' })],
		['ignoreNewcomer', formOf({ immichPersonId: NEW_FACE })]
	] as const;
	for (const [action, form] of posts) {
		it(`${action} lets it through, for handleError to log`, async () => {
			await expect(post(action, broken, form)).rejects.toThrow('disk full');
		});
	}
});
