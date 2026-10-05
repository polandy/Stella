import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { createFakeImmichGateway } from '../../immich/fake-gateway';
import type { ImmichIgnore } from './ignores';
import type { ImmichHolder } from './links';
import { findImmichMatches, PEOPLE_PAGE_SIZE, type ImmichMatchingDeps, type MatchingContact } from './matching';
import type { ImmichMediaSigner } from './signed-media';
import { BERT_ID, CARL_ID, DORA_ID, testLibrary } from './test-library';

/*
 * *Find your people* (docs/concepts/immich.md §4.2, docs/02 §2.24.7): the household's people the
 * viewer sees, next to the faces Immich has named, with what the face and the count need.
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };

const contact = (id: string, firstName: string, lastName: string | null): MatchingContact => ({
	id,
	displayName: [firstName, lastName].filter(Boolean).join(' '),
	firstName,
	lastName,
	nickname: null,
	avatarPhotoId: null
});

/** A signer that writes what it was asked to sign, so a test can read it back off the URL. */
const plainSigner: ImmichMediaSigner = {
	sign: async (media) => `${media.kind}~${media.contactId}~${media.personId}`,
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
	const asked: string[][] = [];
	const deps: ImmichMatchingDeps = {
		gateway,
		contacts: {
			listVisibleTo: async () =>
				options.contacts ?? [contact('c-bert', 'Bert', 'Example'), contact('c-carl', 'Carl', null)]
		},
		links: {
			linkedContactIdsVisibleTo: async () => new Set(options.linkedContacts ?? []),
			holdersOf: async (_viewer, ids) => {
				asked.push([...ids]);
				return new Map(Object.entries(options.holders ?? {}).filter(([id]) => ids.includes(id)));
			}
		},
		ignores: { listVisibleTo: async () => options.ignored ?? [] },
		signer: plainSigner
	};
	return { gateway, deps, asked };
}

describe('findImmichMatches', () => {
	it('proposes each person the viewer sees with the face, the name and the photo count', async () => {
		const { deps } = setup();

		const outcome = await findImmichMatches(deps, viewer);

		expect(outcome).toEqual({
			ok: true,
			rows: [
				{
					contact: { id: 'c-bert', displayName: 'Bert Example', avatarPhotoId: null },
					kind: 'likely',
					candidates: [
						{
							personId: BERT_ID,
							name: 'Bert Example',
							strength: 'likely',
							photoCount: 1284,
							faceUrl: `/media/immich/${encodeURIComponent(`face~c-bert~${BERT_ID}`)}`
						}
					]
				},
				{
					contact: { id: 'c-carl', displayName: 'Carl', avatarPhotoId: null },
					kind: 'maybe',
					candidates: [
						{
							personId: CARL_ID,
							name: 'Carl Example',
							strength: 'maybe',
							photoCount: 7,
							faceUrl: `/media/immich/${encodeURIComponent(`face~c-carl~${CARL_ID}`)}`
						}
					]
				}
			],
			ignored: []
		});
	});

	it('never offers a hidden face', async () => {
		const { deps } = setup({ contacts: [contact('c-dora', 'Dora', 'Example')] });

		expect(await findImmichMatches(deps, viewer)).toEqual({ ok: true, rows: [], ignored: [] });
	});

	it('leaves out people already linked, and faces someone else holds — even someone the viewer cannot see', async () => {
		const { deps, asked } = setup({
			linkedContacts: ['c-carl'],
			holders: { [BERT_ID]: { contactId: 'c-hidden', name: null } }
		});

		expect(await findImmichMatches(deps, viewer)).toEqual({ ok: true, rows: [], ignored: [] });
		// Asked about the named faces only — the hidden one is never a candidate.
		expect(asked).toEqual([[BERT_ID, CARL_ID]]);
	});

	it('reads every page of Immich’s people', async () => {
		const { gateway, deps } = setup({ contacts: [contact('c-x', 'Xaver', 'Last')] });
		const filler = Array.from({ length: PEOPLE_PAGE_SIZE }, (_, index) => ({
			id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
			name: `Filler ${index}`,
			hidden: false,
			assets: 1,
			color: '#000000'
		}));
		gateway.library.people.unshift(...filler);
		gateway.library.people.push({ ...filler[0], id: 'e0000000-0000-4000-8000-000000000001', name: 'Xaver Last' });

		const outcome = await findImmichMatches(deps, viewer);

		expect(outcome.ok && outcome.rows.map((row) => row.contact.id)).toEqual(['c-x']);
		expect(gateway.calls.filter((call) => call === 'listPeople')).toHaveLength(2);
	});

	it('shows a row without a count when the key may not count photos', async () => {
		const { gateway, deps } = setup({ contacts: [contact('c-bert', 'Bert', 'Example')] });
		gateway.failing = { personStatistics: 'forbidden' };

		const outcome = await findImmichMatches(deps, viewer);

		expect(outcome.ok && outcome.rows[0].candidates[0].photoCount).toBeNull();
	});

	it('says why when Immich does not list its people', async () => {
		const { gateway, deps } = setup();
		gateway.failing = { listPeople: 'unauthorized' };

		expect(await findImmichMatches(deps, viewer)).toEqual({ ok: false, failure: 'unauthorized' });
	});

	it('asks Immich nothing more when the viewer sees nobody', async () => {
		const { gateway, deps } = setup({ contacts: [] });

		expect(await findImmichMatches(deps, viewer)).toEqual({ ok: true, rows: [], ignored: [] });
		expect(gateway.calls).toEqual([]);
	});

	it('never proposes an ignored pair, and lists it with who ignored it and when', async () => {
		const { deps } = setup({
			ignored: [
				{ contactId: 'c-bert', immichPersonId: BERT_ID, ignoredBy: 'u-anna', ignoredAt: 5 },
				{ contactId: 'c-carl', immichPersonId: CARL_ID, ignoredBy: 'u-bert', ignoredAt: 9 }
			]
		});

		expect(await findImmichMatches(deps, viewer)).toEqual({
			ok: true,
			rows: [],
			// Newest first: what was just ignored is at the top of the list.
			ignored: [
				{
					contact: { id: 'c-carl', displayName: 'Carl', avatarPhotoId: null },
					personId: CARL_ID,
					immichName: 'Carl Example',
					faceUrl: `/media/immich/${encodeURIComponent(`face~c-carl~${CARL_ID}`)}`,
					ignoredBy: 'u-bert',
					ignoredAt: 9
				},
				{
					contact: { id: 'c-bert', displayName: 'Bert Example', avatarPhotoId: null },
					personId: BERT_ID,
					immichName: 'Bert Example',
					faceUrl: `/media/immich/${encodeURIComponent(`face~c-bert~${BERT_ID}`)}`,
					ignoredBy: 'u-anna',
					ignoredAt: 5
				}
			]
		});
	});

	it('lists an ignored face Immich no longer names without a name', async () => {
		const { deps } = setup({
			contacts: [contact('c-bert', 'Bert', 'Example')],
			ignored: [{ contactId: 'c-bert', immichPersonId: DORA_ID, ignoredBy: 'u-anna', ignoredAt: 5 }]
		});

		const outcome = await findImmichMatches(deps, viewer);

		expect(outcome.ok && outcome.ignored.map((row) => [row.personId, row.immichName])).toEqual([[DORA_ID, null]]);
	});

	it('leaves out an ignored pair whose contact is not listed to the viewer', async () => {
		const { deps } = setup({
			contacts: [contact('c-bert', 'Bert', 'Example')],
			ignored: [{ contactId: 'c-archived', immichPersonId: CARL_ID, ignoredBy: 'u-anna', ignoredAt: 5 }]
		});

		const outcome = await findImmichMatches(deps, viewer);

		expect(outcome.ok && outcome.ignored).toEqual([]);
	});
});
