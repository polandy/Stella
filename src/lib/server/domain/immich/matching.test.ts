import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { createFakeImmichGateway } from '../../immich/fake-gateway';
import type { ImmichHolder } from './links';
import { findImmichMatches, PEOPLE_PAGE_SIZE, type ImmichMatchingDeps, type MatchingContact } from './matching';
import type { ImmichMediaSigner } from './signed-media';
import { BERT_ID, CARL_ID, testLibrary } from './test-library';

/*
 * *Find your people* (docs/concepts/immich.md §4.2, docs/02 §2.24.6): the household's people the
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
			]
		});
	});

	it('never offers a hidden face', async () => {
		const { deps } = setup({ contacts: [contact('c-dora', 'Dora', 'Example')] });

		expect(await findImmichMatches(deps, viewer)).toEqual({ ok: true, rows: [] });
	});

	it('leaves out people already linked, and faces someone else holds — even someone the viewer cannot see', async () => {
		const { deps, asked } = setup({
			linkedContacts: ['c-carl'],
			holders: { [BERT_ID]: { contactId: 'c-hidden', name: null } }
		});

		expect(await findImmichMatches(deps, viewer)).toEqual({ ok: true, rows: [] });
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

		expect(await findImmichMatches(deps, viewer)).toEqual({ ok: true, rows: [] });
		expect(gateway.calls).toEqual([]);
	});
});
