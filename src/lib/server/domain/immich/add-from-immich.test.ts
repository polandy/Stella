import { describe, expect, it } from 'bun:test';
import { createFakeImmichGateway } from '../../immich/fake-gateway';
import type { CreateContactInput } from '../contacts/contacts';
import {
	addPersonFromImmich,
	assignNewcomer,
	WouldReplaceLinkError,
	type AddFromImmichDeps
} from './add-from-immich';
import { ImmichLinkRefusedError, type ImmichLink } from './links';
import { BERT_ID, CARL_ID, DORA_ID, testLibrary } from './test-library';

/*
 * *Assign…* on a row of *New from Immich* (docs/02 §2.24.7): the face goes to someone already in
 * Stella the member picked, or to a person added from it. Either way it goes through the checks of
 * every link; nobody is added for a face that cannot be linked.
 */

const adder = { userId: 'u-anna', householdId: 'h1', locale: 'en' as const };
const actor = { userId: 'u-anna', householdId: 'h1' };
const NOW = 1_700_000_000_000;

function setup() {
	const links = new Map<string, ImmichLink>();
	const added: (CreateContactInput & { id: string })[] = [];
	const names: Record<string, string> = {
		'c-bert': 'Bert Example',
		'c-lena': 'Lena Köhler-Brandt'
	};
	const holderOf = (personId: string) =>
		[...links.values()].find((l) => l.immichPersonId === personId);
	const gateway = createFakeImmichGateway(testLibrary());
	const deps: AddFromImmichDeps = {
		gateway,
		clock: { now: () => NOW },
		ids: { next: () => 'log-1' },
		contacts: {
			findByIdVisibleTo: async (_viewer, id) =>
				names[id] ? { displayName: names[id], visibility: 'shared' } : null
		},
		links: {
			findForContactVisibleTo: async (_viewer, contactId) => links.get(contactId) ?? null,
			linkedContactIdsVisibleTo: async () => new Set(links.keys()),
			holdersOf: async (_viewer, personIds) =>
				new Map(
					personIds.flatMap((id) => {
						const held = holderOf(id);
						return held
							? [[id, { contactId: held.contactId, name: names[held.contactId] ?? null }] as const]
							: [];
					})
				),
			save: async (link) => {
				const held = holderOf(link.immichPersonId);
				if (held && held.contactId !== link.contactId) return 'taken';
				links.set(link.contactId, link);
				return 'saved';
			},
			remove: async (contactId) => links.delete(contactId)
		},
		addContact: async (_adder, input) => {
			const id = `c-new-${added.length + 1}`;
			added.push({ ...input, id });
			names[id] = [input.firstName, input.lastName].filter(Boolean).join(' ');
			return id;
		}
	};
	return { deps, links, added, gateway };
}

const lena = { firstName: 'Lena', lastName: 'Köhler', nickname: '', description: '' };

describe('addPersonFromImmich', () => {
	it('adds the person, shared like anyone added by hand, and links them to the face', async () => {
		const { deps, links, added } = setup();

		const contactId = await addPersonFromImmich(deps, adder, CARL_ID, lena);

		expect(contactId).toBe('c-new-1');
		expect(added).toEqual([
			{
				id: 'c-new-1',
				firstName: 'Lena',
				lastName: 'Köhler',
				nickname: '',
				description: '',
				visibility: 'shared'
			}
		]);
		expect(links.get('c-new-1')).toEqual({
			contactId: 'c-new-1',
			immichPersonId: CARL_ID,
			linkedBy: 'u-anna',
			linkedAt: NOW
		});
	});

	it('adds nobody for a face someone holds by now', async () => {
		const { deps, links, added } = setup();
		links.set('c-bert', {
			contactId: 'c-bert',
			immichPersonId: CARL_ID,
			linkedBy: 'u-bert',
			linkedAt: 1
		});

		await expect(addPersonFromImmich(deps, adder, CARL_ID, lena)).rejects.toBeInstanceOf(
			ImmichLinkRefusedError
		);
		expect(added).toEqual([]);
	});

	it('adds nobody for a face Immich hides or no longer has', async () => {
		const { deps, added, gateway } = setup();

		await expect(addPersonFromImmich(deps, adder, DORA_ID, lena)).rejects.toBeInstanceOf(
			ImmichLinkRefusedError
		);
		gateway.library.people.splice(0, 1);
		await expect(addPersonFromImmich(deps, adder, BERT_ID, lena)).rejects.toBeInstanceOf(
			ImmichLinkRefusedError
		);
		expect(added).toEqual([]);
	});

	it('adds nobody for something that is not an Immich id, without asking Immich', async () => {
		const { deps, added, gateway } = setup();

		await expect(addPersonFromImmich(deps, adder, '../people', lena)).rejects.toBeInstanceOf(
			ImmichLinkRefusedError
		);
		expect(added).toEqual([]);
		expect(gateway.calls).toEqual([]);
	});
});

describe('assignNewcomer', () => {
	it('links the face to the person the member picked', async () => {
		const { deps, links } = setup();

		await assignNewcomer(deps, actor, 'c-lena', CARL_ID, { replace: false });

		expect(links.get('c-lena')?.immichPersonId).toBe(CARL_ID);
	});

	it('asks before replacing the face someone is linked to already, and replaces it once confirmed', async () => {
		const { deps, links } = setup();
		links.set('c-lena', {
			contactId: 'c-lena',
			immichPersonId: BERT_ID,
			linkedBy: 'u-bert',
			linkedAt: 1
		});

		await expect(
			assignNewcomer(deps, actor, 'c-lena', CARL_ID, { replace: false })
		).rejects.toBeInstanceOf(WouldReplaceLinkError);
		expect(links.get('c-lena')?.immichPersonId).toBe(BERT_ID);

		await assignNewcomer(deps, actor, 'c-lena', CARL_ID, { replace: true });
		expect(links.get('c-lena')?.immichPersonId).toBe(CARL_ID);
	});

	it('refuses a face someone else holds by now', async () => {
		const { deps, links } = setup();
		links.set('c-bert', {
			contactId: 'c-bert',
			immichPersonId: CARL_ID,
			linkedBy: 'u-bert',
			linkedAt: 1
		});

		await expect(assignNewcomer(deps, actor, 'c-lena', CARL_ID, { replace: true })).rejects.toThrow(
			'Bert Example'
		);
		expect(links.has('c-lena')).toBe(false);
	});
});
