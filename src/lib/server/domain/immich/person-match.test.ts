import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { createFakeImmichGateway } from '../../immich/fake-gateway';
import type { ImmichIgnore } from './ignores';
import type { ImmichHolder } from './links';
import type { MatchingContact } from './matching';
import { findLikelyMatchFor, type PersonMatchDeps } from './person-match';
import type { ImmichMediaSigner } from './signed-media';
import { BERT_ID, CARL_ID, testLibrary } from './test-library';

/*
 * The person page's suggestion (docs/02 §2.24.7): the one face *Find your people* would link in
 * one tap for this person, read the same way — or nothing. A maybe stays in the settings list.
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };

const contact = (id: string, firstName: string, lastName: string | null): MatchingContact => ({
	id,
	displayName: [firstName, lastName].filter(Boolean).join(' '),
	firstName,
	lastName,
	nickname: null,
	description: null,
	avatarPhotoId: null
});

const plainSigner: ImmichMediaSigner = {
	sign: async (media) =>
		`${media.kind}~${'contactId' in media ? media.contactId : media.householdId}~${media.personId}`,
	verify: async () => ({ ok: false, reason: 'invalid' })
};

function setup(
	options: {
		contacts?: MatchingContact[];
		linkedContacts?: string[];
		holders?: Record<string, ImmichHolder>;
		ignored?: ImmichIgnore[];
	} = {}
) {
	const gateway = createFakeImmichGateway(testLibrary());
	const deps: PersonMatchDeps = {
		gateway,
		directory: {
			listVisibleTo: async () =>
				options.contacts ?? [contact('c-bert', 'Bert', 'Example'), contact('c-carl', 'Carl', null)]
		},
		links: {
			linkedContactIdsVisibleTo: async () => new Set(options.linkedContacts ?? []),
			holdersOf: async (_viewer, ids) =>
				new Map(Object.entries(options.holders ?? {}).filter(([id]) => ids.includes(id)))
		},
		ignores: { listVisibleTo: async () => options.ignored ?? [] },
		signer: plainSigner
	};
	return { gateway, deps };
}

describe('findLikelyMatchFor', () => {
	it('offers the likely face with its name, photo count and a face signed for the person', async () => {
		const { deps } = setup();

		expect(await findLikelyMatchFor(deps, viewer, 'c-bert')).toEqual({
			kind: 'answered',
			match: {
				personId: BERT_ID,
				name: 'Bert Example',
				photoCount: 1284,
				faceUrl: `/media/immich/${encodeURIComponent(`face~c-bert~${BERT_ID}`)}`
			}
		});
	});

	it('offers nothing for a maybe', async () => {
		const { deps } = setup();

		// Carl is known by a first name only: *Carl Example* is a maybe for him.
		expect(await findLikelyMatchFor(deps, viewer, 'c-carl')).toEqual({
			kind: 'answered',
			match: null
		});
	});

	it('offers nothing when a second person shares the full name — the list makes that a maybe', async () => {
		const { deps } = setup({
			contacts: [contact('c-bert', 'Bert', 'Example'), contact('c-bert-2', 'Bert', 'Example')]
		});

		expect(await findLikelyMatchFor(deps, viewer, 'c-bert')).toEqual({
			kind: 'answered',
			match: null
		});
	});

	it('offers nothing for an ignored pair, and the same face to someone it was not ignored for', async () => {
		const ignored = [
			{ contactId: 'c-bert', immichPersonId: BERT_ID, ignoredBy: 'u-anna', ignoredAt: 1 }
		];
		const { deps } = setup({ ignored });

		expect(await findLikelyMatchFor(deps, viewer, 'c-bert')).toEqual({
			kind: 'answered',
			match: null
		});
		const other = setup({ ignored, contacts: [contact('c-carl', 'Carl', 'Example')] });
		const carl = await findLikelyMatchFor(other.deps, viewer, 'c-carl');
		expect(carl.kind === 'answered' && carl.match?.personId).toBe(CARL_ID);
	});

	it('offers nothing for a face somebody holds, even someone the viewer cannot see', async () => {
		const { deps } = setup({ holders: { [BERT_ID]: { contactId: 'c-hidden', name: null } } });

		expect(await findLikelyMatchFor(deps, viewer, 'c-bert')).toEqual({
			kind: 'answered',
			match: null
		});
	});

	it('does not ask Immich about a person already linked', async () => {
		const { gateway, deps } = setup({ linkedContacts: ['c-bert'] });

		expect(await findLikelyMatchFor(deps, viewer, 'c-bert')).toEqual({
			kind: 'answered',
			match: null
		});
		expect(gateway.calls).toEqual([]);
	});

	it('refuses a person the viewer may not see, without asking Immich', async () => {
		const { gateway, deps } = setup({ contacts: [contact('c-carl', 'Carl', 'Example')] });

		expect(await findLikelyMatchFor(deps, viewer, 'c-bert')).toEqual({ kind: 'notVisible' });
		expect(gateway.calls).toEqual([]);
	});

	it('says Immich failed when it does not list its people', async () => {
		const { gateway, deps } = setup();
		gateway.failing = { listPeople: 'unreachable' };

		expect(await findLikelyMatchFor(deps, viewer, 'c-bert')).toEqual({
			kind: 'failed',
			failure: 'unreachable'
		});
	});

	it('offers the face without a count when the key may not count photos', async () => {
		const { gateway, deps } = setup();
		gateway.failing = { personStatistics: 'forbidden' };

		const outcome = await findLikelyMatchFor(deps, viewer, 'c-bert');

		expect(outcome.kind === 'answered' && outcome.match).toMatchObject({
			personId: BERT_ID,
			photoCount: null
		});
	});

	it('asks Immich for the count of the proposed face only', async () => {
		const { gateway, deps } = setup();

		await findLikelyMatchFor(deps, viewer, 'c-bert');

		expect(gateway.calls.filter((call) => call === 'personStatistics')).toHaveLength(1);
	});
});
