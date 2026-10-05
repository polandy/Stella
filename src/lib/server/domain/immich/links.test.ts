import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { NewActivityEntry } from '../activity/activity';
import { ContactGoneError } from '../contacts/require-visible';
import { createFakeImmichGateway } from '../../immich/fake-gateway';
import {
	findImmichFaces,
	IMMICH_LINK_ENTITY,
	ImmichLinkRefusedError,
	linkMatches,
	linkToImmich,
	readLinkedPerson,
	unlinkFromImmich,
	type ImmichLink,
	type ImmichLinkRepository,
	type LinkVisibleContacts
} from './links';
import { BERT_ID, CARL_ID, DORA_ID, testLibrary } from './test-library';

const HOUSEHOLD = 'h1';
const ANNA_USER = 'u-anna';
const actor = { userId: ANNA_USER, householdId: HOUSEHOLD };
const viewer: Viewer = { id: ANNA_USER, householdId: HOUSEHOLD };
const PUBLIC_URL = 'https://immich.example.com';
const NOW = 1_700_000_000_000;

/** The contacts the actor can see; any other id is "gone" (deleted, merged, private). */
function visibleContacts(): LinkVisibleContacts {
	const known: Record<string, { displayName: string; visibility: 'shared' | 'private' }> = {
		'c-bert': { displayName: 'Bert Example', visibility: 'shared' },
		'c-carl': { displayName: 'Carl Example', visibility: 'private' }
	};
	return { findByIdVisibleTo: async (_viewer, id) => known[id] ?? null };
}

/** Names of the contacts the actor can see; a holder outside this list is someone they cannot. */
const VISIBLE_NAMES: Record<string, string> = { 'c-bert': 'Bert Example', 'c-carl': 'Carl Example' };

/**
 * Links held in memory, with every activity entry written beside them. Like the table, one
 * Immich person belongs to one contact; `raceWinner` plants a link that lands between the
 * use-case's check and its write, the way a second member's request would.
 */
function memoryLinks() {
	const rows = new Map<string, ImmichLink>();
	const audit: NewActivityEntry[] = [];
	const state = { raceWinner: null as ImmichLink | null };
	const holderOf = (personId: string) => [...rows.values()].find((l) => l.immichPersonId === personId);
	const links: ImmichLinkRepository = {
		findForContactVisibleTo: async (_viewer, contactId) => rows.get(contactId) ?? null,
		linkedContactIdsVisibleTo: async () => new Set(rows.keys()),
		holdersOf: async (_viewer, personIds) => {
			const holders = new Map<string, { contactId: string; name: string | null }>();
			for (const personId of personIds) {
				const held = holderOf(personId);
				if (held) holders.set(personId, { contactId: held.contactId, name: VISIBLE_NAMES[held.contactId] ?? null });
			}
			return holders;
		},
		save: async (link, entry) => {
			if (state.raceWinner) {
				rows.set(state.raceWinner.contactId, state.raceWinner);
				state.raceWinner = null;
			}
			const held = holderOf(link.immichPersonId);
			if (held && held.contactId !== link.contactId) return 'taken';
			rows.set(link.contactId, link);
			audit.push(entry);
			return 'saved';
		},
		remove: async (contactId, entry) => {
			if (!rows.delete(contactId)) return false;
			audit.push(entry);
			return true;
		}
	};
	return { links, rows, audit, state };
}

function setup() {
	const gateway = createFakeImmichGateway(testLibrary());
	const memory = memoryLinks();
	let next = 0;
	const deps = {
		links: memory.links,
		contacts: visibleContacts(),
		gateway,
		clock: { now: () => NOW },
		ids: { next: () => `id-${++next}` }
	};
	return { gateway, deps, ...memory };
}

describe('linkToImmich', () => {
	it('links a contact to an Immich person, and writes it to the log', async () => {
		const { deps, rows, audit } = setup();
		await linkToImmich(deps, actor, 'c-bert', BERT_ID);

		expect(rows.get('c-bert')).toEqual({
			contactId: 'c-bert',
			immichPersonId: BERT_ID,
			linkedBy: ANNA_USER,
			linkedAt: NOW
		});
		expect(audit).toEqual([
			{
				id: 'id-1',
				householdId: HOUSEHOLD,
				actorId: ANNA_USER,
				action: 'update',
				entityType: IMMICH_LINK_ENTITY,
				entityId: 'c-bert',
				contactId: 'c-bert',
				visibility: 'shared',
				summary: 'linked Bert Example to Immich',
				createdAt: NOW
			}
		]);
	});

	it('logs a private contact’s link as private, so the log leaks nothing', async () => {
		const { deps, audit } = setup();
		await linkToImmich(deps, actor, 'c-carl', CARL_ID);
		expect(audit[0].visibility).toBe('private');
	});

	it('replaces the link a contact already had', async () => {
		const { deps, rows } = setup();
		await linkToImmich(deps, actor, 'c-bert', BERT_ID);
		await linkToImmich(deps, actor, 'c-bert', CARL_ID);
		expect(rows.get('c-bert')?.immichPersonId).toBe(CARL_ID);
	});

	it('refuses a contact the actor cannot see', async () => {
		const { deps, rows, gateway } = setup();
		await expect(linkToImmich(deps, actor, 'c-gone', BERT_ID)).rejects.toBeInstanceOf(ContactGoneError);
		expect(rows.size).toBe(0);
		// Refused before Immich was bothered.
		expect(gateway.calls).toEqual([]);
	});

	it('refuses an id that is not an Immich id, without asking Immich', async () => {
		const { deps, rows, gateway } = setup();
		await expect(linkToImmich(deps, actor, 'c-bert', '../users/me')).rejects.toBeInstanceOf(
			ImmichLinkRefusedError
		);
		expect(rows.size).toBe(0);
		expect(gateway.calls).toEqual([]);
	});

	it('refuses a person deleted in Immich', async () => {
		const { deps, rows, gateway } = setup();
		gateway.library.people = gateway.library.people.filter((p) => p.id !== BERT_ID);
		const refusal = await linkToImmich(deps, actor, 'c-bert', BERT_ID).catch((e) => e);
		expect(refusal).toBeInstanceOf(ImmichLinkRefusedError);
		expect(refusal.message).toBe('This person is no longer in Immich.');
		expect(rows.size).toBe(0);
	});

	it('refuses a person hidden in Immich, as Immich’s own hiding is respected', async () => {
		const { deps, rows } = setup();
		await expect(linkToImmich(deps, actor, 'c-bert', DORA_ID)).rejects.toBeInstanceOf(ImmichLinkRefusedError);
		expect(rows.size).toBe(0);
	});

	it('refuses while Immich is down, and while the key is revoked', async () => {
		for (const [failure, message] of [
			['unreachable', 'Immich didn’t answer. Try again in a moment.'],
			['unauthorized', 'Immich refused Stella’s key. An admin needs to check it.']
		] as const) {
			const { deps, rows, gateway } = setup();
			gateway.failing = { person: failure };
			const refusal = await linkToImmich(deps, actor, 'c-bert', BERT_ID).catch((e) => e);
			expect(refusal).toBeInstanceOf(ImmichLinkRefusedError);
			expect(refusal.message).toBe(message);
			expect(rows.size).toBe(0);
		}
	});
});

describe('linkMatches', () => {
	it('links every pair from the matching list, and counts them', async () => {
		const { deps, rows } = setup();

		const result = await linkMatches(deps, actor, [
			{ contactId: 'c-bert', immichPersonId: BERT_ID },
			{ contactId: 'c-carl', immichPersonId: CARL_ID }
		]);

		expect(result).toEqual({ linked: 2, refused: [] });
		expect(rows.get('c-bert')?.immichPersonId).toBe(BERT_ID);
		expect(rows.get('c-carl')?.immichPersonId).toBe(CARL_ID);
	});

	it('never replaces a link made since the list was shown', async () => {
		const { deps, rows, audit } = setup();
		rows.set('c-bert', { contactId: 'c-bert', immichPersonId: CARL_ID, linkedBy: 'u-other', linkedAt: 1 });

		const result = await linkMatches(deps, actor, [{ contactId: 'c-bert', immichPersonId: BERT_ID }]);

		expect(result.linked).toBe(0);
		expect(result.refused.map((r) => r.error.message)).toEqual(['Bert Example is linked already.']);
		expect(rows.get('c-bert')?.immichPersonId).toBe(CARL_ID);
		expect(audit).toEqual([]);
	});

	it('goes on past a refusal, and says which', async () => {
		const { deps, rows } = setup();

		const result = await linkMatches(deps, actor, [
			{ contactId: 'c-gone', immichPersonId: BERT_ID },
			{ contactId: 'c-bert', immichPersonId: DORA_ID },
			{ contactId: 'c-carl', immichPersonId: CARL_ID }
		]);

		expect(result.linked).toBe(1);
		expect(result.refused.map((r) => r.contactId)).toEqual(['c-gone', 'c-bert']);
		expect(rows.get('c-carl')?.immichPersonId).toBe(CARL_ID);
	});

	it('lets an unexpected error through rather than counting it as a refusal', async () => {
		const { deps } = setup();
		deps.links.save = async () => {
			throw new Error('disk full');
		};

		await expect(linkMatches(deps, actor, [{ contactId: 'c-bert', immichPersonId: BERT_ID }])).rejects.toThrow(
			'disk full'
		);
	});
});

describe('one Immich person per contact', () => {
	const held = (contactId: string, immichPersonId = BERT_ID): ImmichLink => ({
		contactId,
		immichPersonId,
		linkedBy: 'u-other',
		linkedAt: 1
	});

	it('refuses a person already linked to another contact, naming them when the actor sees them', async () => {
		const { deps, rows, audit } = setup();
		rows.set('c-carl', held('c-carl'));
		const refusal = await linkToImmich(deps, actor, 'c-bert', BERT_ID).catch((e) => e);
		expect(refusal).toBeInstanceOf(ImmichLinkRefusedError);
		expect(refusal.message).toBe('This face is already linked to Carl Example.');
		expect(rows.get('c-bert')).toBeUndefined();
		expect(audit).toEqual([]);
	});

	it('names nobody when the other contact is one the actor cannot see', async () => {
		const { deps, rows } = setup();
		rows.set('c-someone-private', held('c-someone-private'));
		const refusal = await linkToImmich(deps, actor, 'c-bert', BERT_ID).catch((e) => e);
		expect(refusal).toBeInstanceOf(ImmichLinkRefusedError);
		expect(refusal.message).toBe('This face is already linked to another person in Stella.');
	});

	it('refuses before asking Immich, so a taken face costs no call', async () => {
		const { deps, rows, gateway } = setup();
		rows.set('c-carl', held('c-carl'));
		await linkToImmich(deps, actor, 'c-bert', BERT_ID).catch(() => null);
		expect(gateway.calls).toEqual([]);
	});

	it('lets a contact be linked again to the person it already has', async () => {
		const { deps, rows } = setup();
		rows.set('c-bert', held('c-bert'));
		await linkToImmich(deps, actor, 'c-bert', BERT_ID);
		expect(rows.get('c-bert')?.linkedBy).toBe(ANNA_USER);
	});

	it('turns a link that won the race between check and write into the same refusal', async () => {
		const { deps, rows, state, audit } = setup();
		state.raceWinner = held('c-carl');
		const refusal = await linkToImmich(deps, actor, 'c-bert', BERT_ID).catch((e) => e);
		expect(refusal).toBeInstanceOf(ImmichLinkRefusedError);
		expect(refusal.message).toBe('This face is already linked to Carl Example.');
		expect(rows.get('c-carl')?.immichPersonId).toBe(BERT_ID);
		expect(rows.get('c-bert')).toBeUndefined();
		expect(audit).toEqual([]);
	});
});

describe('unlinkFromImmich', () => {
	it('removes the link and writes it to the log', async () => {
		const { deps, rows, audit } = setup();
		await linkToImmich(deps, actor, 'c-bert', BERT_ID);
		expect(await unlinkFromImmich(deps, actor, 'c-bert')).toBe(true);

		expect(rows.size).toBe(0);
		expect(audit[1]).toMatchObject({
			action: 'update',
			entityType: IMMICH_LINK_ENTITY,
			contactId: 'c-bert',
			summary: 'unlinked Bert Example from Immich'
		});
	});

	it('needs no Immich at all — unlinking works while it is down', async () => {
		const { deps, rows, gateway } = setup();
		await linkToImmich(deps, actor, 'c-bert', BERT_ID);
		gateway.failing = { person: 'unreachable', version: 'unreachable' };
		const before = gateway.calls.length;

		expect(await unlinkFromImmich(deps, actor, 'c-bert')).toBe(true);
		expect(rows.size).toBe(0);
		expect(gateway.calls.length).toBe(before);
	});

	it('writes nothing for a contact that was not linked', async () => {
		const { deps, audit } = setup();
		expect(await unlinkFromImmich(deps, actor, 'c-bert')).toBe(false);
		expect(audit).toEqual([]);
	});

	it('refuses a contact the actor cannot see', async () => {
		const { deps } = setup();
		await expect(unlinkFromImmich(deps, actor, 'c-gone')).rejects.toBeInstanceOf(ContactGoneError);
	});
});

describe('readLinkedPerson', () => {
	function linked(gateway = createFakeImmichGateway(testLibrary())) {
		return { gateway, deps: { gateway, publicUrl: PUBLIC_URL } };
	}

	it('gives the count and the way into Immich', async () => {
		const { deps } = linked();
		expect(await readLinkedPerson(deps, BERT_ID)).toEqual({
			state: 'linked',
			name: 'Bert Example',
			photoCount: 1284,
			openUrl: `${PUBLIC_URL}/people/${BERT_ID}`
		});
	});

	it('keeps the way into Immich whenever the person answered, whatever the connection check says', async () => {
		const { deps, gateway } = linked();
		gateway.failing = { version: 'unreachable' };
		const seen = await readLinkedPerson(deps, BERT_ID);
		expect(seen).toMatchObject({ state: 'linked', openUrl: `${PUBLIC_URL}/people/${BERT_ID}` });
	});

	it('says when the person was deleted in Immich', async () => {
		const { deps, gateway } = linked();
		gateway.library.people = [];
		expect(await readLinkedPerson(deps, BERT_ID)).toEqual({ state: 'personGone' });
	});

	it('says when Immich did not answer, or no longer takes the key', async () => {
		for (const failure of ['unreachable', 'unauthorized'] as const) {
			const { deps, gateway } = linked();
			gateway.failing = { person: failure };
			expect(await readLinkedPerson(deps, BERT_ID)).toEqual({ state: 'unreachable' });
		}
	});

	it('leaves the count out when the key may not read it, rather than failing the line', async () => {
		const { deps, gateway } = linked();
		gateway.failing = { personStatistics: 'forbidden' };
		expect(await readLinkedPerson(deps, BERT_ID)).toMatchObject({
			state: 'linked',
			photoCount: null
		});
	});
});

describe('findImmichFaces', () => {
	it('finds the faces whose name matches, never a hidden one', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		expect(await findImmichFaces({ gateway, links: memoryLinks().links }, viewer, 'example')).toEqual({
			ok: true,
			faces: [
				{ id: BERT_ID, name: 'Bert Example', linkedTo: null },
				{ id: CARL_ID, name: 'Carl Example', linkedTo: null }
			]
		});
	});

	it('lists the named faces when nothing is typed', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		gateway.library.people.push({ id: '0e4f5a6b-7c8d-4e90-9c4d-5e6f7a8b9ca3', name: '', hidden: false, assets: 2, color: '#000000' });
		const found = await findImmichFaces({ gateway, links: memoryLinks().links }, viewer, '  ');
		expect(found.ok && found.faces.map((f) => f.name)).toEqual(['Bert Example', 'Carl Example']);
		expect(gateway.calls).toEqual(['listPeople']);
	});

	it('falls back to the first name when the full name finds nobody', async () => {
		// Stella knows Bert as "Bert Example-Smith"; Immich only as "Bert Example".
		const gateway = createFakeImmichGateway(testLibrary());
		const found = await findImmichFaces({ gateway, links: memoryLinks().links }, viewer, 'Bert Example-Smith');
		expect(found).toEqual({ ok: true, faces: [{ id: BERT_ID, name: 'Bert Example', linkedTo: null }] });
		expect(gateway.calls).toEqual(['searchPeople', 'searchPeople']);
	});

	it('marks a face already linked to someone, naming them only when the viewer sees them', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		const { links, rows } = memoryLinks();
		rows.set('c-carl', { contactId: 'c-carl', immichPersonId: BERT_ID, linkedBy: 'u', linkedAt: 1 });
		rows.set('c-hidden', { contactId: 'c-hidden', immichPersonId: CARL_ID, linkedBy: 'u', linkedAt: 1 });
		expect(await findImmichFaces({ gateway, links }, viewer, 'example')).toEqual({
			ok: true,
			faces: [
				{ id: BERT_ID, name: 'Bert Example', linkedTo: { name: 'Carl Example' } },
				{ id: CARL_ID, name: 'Carl Example', linkedTo: { name: null } }
			]
		});
	});

	it('passes a failure on, so the picker can say what went wrong', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		gateway.failing = { searchPeople: 'unreachable' };
		expect(await findImmichFaces({ gateway, links: memoryLinks().links }, viewer, 'bert')).toEqual({ ok: false, failure: 'unreachable' });
	});
});
