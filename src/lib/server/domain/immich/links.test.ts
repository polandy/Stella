import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { NewActivityEntry } from '../activity/activity';
import { ContactGoneError } from '../contacts/require-visible';
import { createFakeImmichGateway } from '../../immich/fake-gateway';
import { createImmichConnection } from './connection';
import {
	findImmichFaces,
	IMMICH_LINK_ENTITY,
	ImmichLinkRefusedError,
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

/** Links held in memory, with every activity entry written beside them. */
function memoryLinks() {
	const rows = new Map<string, ImmichLink>();
	const audit: NewActivityEntry[] = [];
	const links: ImmichLinkRepository = {
		findForContactVisibleTo: async (_viewer, contactId) => rows.get(contactId) ?? null,
		save: async (link, entry) => {
			rows.set(link.contactId, link);
			audit.push(entry);
		},
		remove: async (contactId, entry) => {
			if (!rows.delete(contactId)) return false;
			audit.push(entry);
			return true;
		}
	};
	return { links, rows, audit };
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
		const connection = createImmichConnection({ gateway, clock: { now: () => NOW } });
		return { gateway, deps: { gateway, connection, publicUrl: PUBLIC_URL } };
	}

	it('gives the key owner the count and the way into Immich', async () => {
		const { deps } = linked();
		expect(await readLinkedPerson(deps, BERT_ID, 'anna@example.test')).toEqual({
			state: 'linked',
			name: 'Bert Example',
			photoCount: 1284,
			openUrl: `${PUBLIC_URL}/people/${BERT_ID}`
		});
	});

	it('gives every other member the count, and no link that would lead nowhere', async () => {
		const { deps } = linked();
		const seen = await readLinkedPerson(deps, BERT_ID, 'bert@example.test');
		expect(seen).toMatchObject({ state: 'linked', photoCount: 1284, openUrl: null });
	});

	it('says when the person was deleted in Immich', async () => {
		const { deps, gateway } = linked();
		gateway.library.people = [];
		expect(await readLinkedPerson(deps, BERT_ID, 'anna@example.test')).toEqual({ state: 'personGone' });
	});

	it('says when Immich did not answer, or no longer takes the key', async () => {
		for (const failure of ['unreachable', 'unauthorized'] as const) {
			const { deps, gateway } = linked();
			gateway.failing = { person: failure };
			expect(await readLinkedPerson(deps, BERT_ID, 'anna@example.test')).toEqual({ state: 'unreachable' });
		}
	});

	it('leaves the count out when the key may not read it, rather than failing the line', async () => {
		const { deps, gateway } = linked();
		gateway.failing = { personStatistics: 'forbidden' };
		expect(await readLinkedPerson(deps, BERT_ID, 'bert@example.test')).toMatchObject({
			state: 'linked',
			photoCount: null
		});
	});
});

describe('findImmichFaces', () => {
	it('finds the faces whose name matches, never a hidden one', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		expect(await findImmichFaces({ gateway }, 'example')).toEqual({
			ok: true,
			faces: [
				{ id: BERT_ID, name: 'Bert Example' },
				{ id: CARL_ID, name: 'Carl Example' }
			]
		});
	});

	it('lists the named faces when nothing is typed', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		gateway.library.people.push({ id: '0e4f5a6b-7c8d-4e90-9c4d-5e6f7a8b9ca3', name: '', hidden: false, assets: 2, color: '#000000' });
		const found = await findImmichFaces({ gateway }, '  ');
		expect(found.ok && found.faces.map((f) => f.name)).toEqual(['Bert Example', 'Carl Example']);
		expect(gateway.calls).toEqual(['listPeople']);
	});

	it('falls back to the first name when the full name finds nobody', async () => {
		// Stella knows Bert as "Bert Example-Smith"; Immich only as "Bert Example".
		const gateway = createFakeImmichGateway(testLibrary());
		const found = await findImmichFaces({ gateway }, 'Bert Example-Smith');
		expect(found).toEqual({ ok: true, faces: [{ id: BERT_ID, name: 'Bert Example' }] });
		expect(gateway.calls).toEqual(['searchPeople', 'searchPeople']);
	});

	it('passes a failure on, so the picker can say what went wrong', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		gateway.failing = { searchPeople: 'unreachable' };
		expect(await findImmichFaces({ gateway }, 'bert')).toEqual({ ok: false, failure: 'unreachable' });
	});
});
