import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { createFakeImmichGateway } from '../../immich/fake-gateway';
import type { ContextMembershipRow } from '../contacts/person-context';
import type { ImmichIgnore } from './ignores';
import type { ImmichHolder } from './links';
import {
	findImmichMatches,
	PEOPLE_PAGE_SIZE,
	type ImmichMatchingDeps,
	type MatchingContact
} from './matching';
import type { ImmichNameIgnore } from './name-ignores';
import type { ImmichMediaSigner } from './signed-media';
import { BERT_ID, CARL_ID, DORA_ID, testLibrary } from './test-library';

/*
 * *Find your people* (docs/concepts/immich.md §4.2, docs/02 §2.24.7): the household's people the
 * viewer sees, next to the faces Immich has named, with what the face and the count need — and,
 * from the same reading of Immich, the named faces that are nobody in Stella yet.
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };
const day = { selfContactId: null, today: '2026-10-05' };
const PUBLIC_URL = 'https://photos.example.test';
const MANFRED_ID = '0f5a6b7c-8d9e-4fa0-8d5e-6f7a8b9cadb4';
const SANDRA_ID = '1a6b7c8d-9eaf-4ab0-9e6f-7a8b9cadbec5';
const faceOf = (contactId: string, personId: string) =>
	`/media/immich/${encodeURIComponent(`face~${contactId}~${personId}`)}`;
const newcomerFace = (personId: string) =>
	`/media/immich/${encodeURIComponent(`newcomer~h1~${personId}`)}`;

const contact = (id: string, firstName: string, lastName: string | null): MatchingContact => ({
	id,
	displayName: [firstName, lastName].filter(Boolean).join(' '),
	firstName,
	lastName,
	nickname: null,
	description: null,
	avatarPhotoId: null
});

/** A signer that writes what it was asked to sign, so a test can read it back off the URL. */
/** Bert's and Carl's faces taken by somebody, so they are nobody's newcomers either. */
const heldBertAndCarl: Record<string, ImmichHolder> = {
	[BERT_ID]: { contactId: 'c-x', name: null },
	[CARL_ID]: { contactId: 'c-y', name: null }
};
const nothing = { ok: true as const, rows: [], ignored: [], newcomers: [], ignoredNewcomers: [] };

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
		ignoredNames?: ImmichNameIgnore[];
		memberships?: ContextMembershipRow[];
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
		nameIgnores: { listForHousehold: async () => options.ignoredNames ?? [] },
		contextReads: {
			listTiesOfVisibleTo: async () => [],
			listMembershipsOfVisibleTo: async (_viewer, ids) =>
				(options.memberships ?? []).filter((m) => ids.includes(m.contactId))
		},
		signer: plainSigner,
		publicUrl: PUBLIC_URL
	};
	return { gateway, deps, asked };
}

describe('findImmichMatches', () => {
	it('proposes each person the viewer sees with the face, the name and the photo count', async () => {
		const { deps } = setup();

		const outcome = await findImmichMatches(deps, viewer, day);

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
			ignored: [],
			newcomers: [],
			ignoredNewcomers: []
		});
	});

	it('never offers a hidden face', async () => {
		const { deps } = setup({
			contacts: [contact('c-dora', 'Dora', 'Example')],
			holders: heldBertAndCarl
		});

		expect(await findImmichMatches(deps, viewer, day)).toEqual(nothing);
	});

	it('leaves out people already linked, and faces someone else holds — even someone the viewer cannot see', async () => {
		const { deps, asked } = setup({
			linkedContacts: ['c-carl'],
			holders: { [BERT_ID]: { contactId: 'c-hidden', name: null } }
		});

		const outcome = await findImmichMatches(deps, viewer, day);
		expect(outcome.ok && outcome.rows).toEqual([]);
		// Carl's face is free, and nobody else is proposed it: it is new from Immich.
		expect(outcome.ok && outcome.newcomers.map((row) => row.personId)).toEqual([CARL_ID]);
		// Asked about the faces Immich lists — the hidden one is never a candidate.
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
		gateway.library.people.push({
			...filler[0],
			id: 'e0000000-0000-4000-8000-000000000001',
			name: 'Xaver Last'
		});

		const outcome = await findImmichMatches(deps, viewer, day);

		expect(outcome.ok && outcome.rows.map((row) => row.contact.id)).toEqual(['c-x']);
		expect(gateway.calls.filter((call) => call === 'listPeople')).toHaveLength(2);
	});

	it('shows a row without a count when the key may not count photos', async () => {
		const { gateway, deps } = setup({ contacts: [contact('c-bert', 'Bert', 'Example')] });
		gateway.failing = { personStatistics: 'forbidden' };

		const outcome = await findImmichMatches(deps, viewer, day);

		expect(outcome.ok && outcome.rows[0].candidates[0].photoCount).toBeNull();
	});

	it('says why when Immich does not list its people', async () => {
		const { gateway, deps } = setup();
		gateway.failing = { listPeople: 'unauthorized' };

		expect(await findImmichMatches(deps, viewer, day)).toEqual({
			ok: false,
			failure: 'unauthorized'
		});
	});

	it('offers every named face as new when the viewer sees nobody', async () => {
		const { deps } = setup({ contacts: [] });

		const outcome = await findImmichMatches(deps, viewer, day);

		expect(outcome.ok && outcome.rows).toEqual([]);
		expect(outcome.ok && outcome.newcomers.map((row) => row.personId)).toEqual([BERT_ID, CARL_ID]);
	});

	it('never proposes an ignored pair, and lists it with who ignored it and when', async () => {
		const { deps } = setup({
			holders: heldBertAndCarl,
			ignored: [
				{ contactId: 'c-bert', immichPersonId: BERT_ID, ignoredBy: 'u-anna', ignoredAt: 5 },
				{ contactId: 'c-carl', immichPersonId: CARL_ID, ignoredBy: 'u-bert', ignoredAt: 9 }
			]
		});

		expect(await findImmichMatches(deps, viewer, day)).toEqual({
			...nothing,
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

		const outcome = await findImmichMatches(deps, viewer, day);

		expect(outcome.ok && outcome.ignored.map((row) => [row.personId, row.immichName])).toEqual([
			[DORA_ID, null]
		]);
	});

	it('leaves out an ignored pair whose contact is not listed to the viewer', async () => {
		const { deps } = setup({
			contacts: [contact('c-bert', 'Bert', 'Example')],
			ignored: [
				{ contactId: 'c-archived', immichPersonId: CARL_ID, ignoredBy: 'u-anna', ignoredAt: 5 }
			]
		});

		const outcome = await findImmichMatches(deps, viewer, day);

		expect(outcome.ok && outcome.ignored).toEqual([]);
	});
});

describe('findImmichMatches — new from Immich', () => {
	/** Bert and Carl are taken; Immich also knows Opa Manfred and Sandra, whom nobody holds. */
	function withNewcomers(options: Parameters<typeof setup>[0] = {}) {
		const made = setup({ holders: heldBertAndCarl, ...options });
		made.gateway.library.people.push(
			{ id: SANDRA_ID, name: 'Sandra', hidden: false, assets: 19, color: '#000000' },
			{ id: MANFRED_ID, name: 'Opa  Manfred', hidden: false, assets: 87, color: '#000000' }
		);
		return made;
	}

	it('lists the named faces nobody holds, most photos first, with the face, the count and the way to Immich', async () => {
		const { deps } = withNewcomers({ contacts: [] });

		const outcome = await findImmichMatches(deps, viewer, day);

		expect(outcome.ok && outcome.newcomers).toEqual([
			{
				personId: MANFRED_ID,
				name: 'Opa Manfred',
				photoCount: 87,
				faceUrl: newcomerFace(MANFRED_ID),
				openUrl: `${PUBLIC_URL}/people/${MANFRED_ID}`,
				similar: []
			},
			{
				personId: SANDRA_ID,
				name: 'Sandra',
				photoCount: 19,
				faceUrl: newcomerFace(SANDRA_ID),
				openUrl: `${PUBLIC_URL}/people/${SANDRA_ID}`,
				similar: []
			}
		]);
	});

	it('names the people in Stella the face might already be, with what tells them apart', async () => {
		const { deps } = withNewcomers({
			contacts: [contact('c-manfred', 'Manfred', 'Pollari'), contact('c-tom', 'Tom', 'Weber')],
			memberships: [
				{
					contactId: 'c-manfred',
					circleId: 'k-family',
					parentCircleId: null,
					name: 'Family',
					role: null,
					startDate: null,
					endDate: null
				}
			]
		});

		const outcome = await findImmichMatches(deps, viewer, day);
		const manfred = outcome.ok
			? outcome.newcomers.find((row) => row.personId === MANFRED_ID)
			: null;

		expect(manfred?.similar).toEqual([
			{
				contact: { id: 'c-manfred', displayName: 'Manfred Pollari', avatarPhotoId: null },
				description: null,
				context: { ties: [], circle: { name: 'Family', role: null } },
				linkedFace: null
			}
		]);
	});

	it('shows the face someone similar is linked to already, so the two can be compared', async () => {
		const { deps } = withNewcomers({
			contacts: [contact('c-carl', 'Manfred', 'Example')],
			linkedContacts: ['c-carl'],
			holders: {
				[BERT_ID]: { contactId: 'c-x', name: null },
				[CARL_ID]: { contactId: 'c-carl', name: 'Manfred Example' }
			}
		});

		const outcome = await findImmichMatches(deps, viewer, day);
		const manfred = outcome.ok
			? outcome.newcomers.find((row) => row.personId === MANFRED_ID)
			: null;

		expect(manfred?.similar.map((person) => person.linkedFace)).toEqual([
			{ name: 'Carl Example', faceUrl: faceOf('c-carl', CARL_ID) }
		]);
	});

	it('leaves out an ignored face, and lists it with who ignored it and when, newest first', async () => {
		const { deps } = withNewcomers({
			contacts: [],
			ignoredNames: [
				{ householdId: 'h1', immichPersonId: SANDRA_ID, ignoredBy: 'u-anna', ignoredAt: 5 },
				{ householdId: 'h1', immichPersonId: DORA_ID, ignoredBy: 'u-bert', ignoredAt: 9 }
			]
		});

		const outcome = await findImmichMatches(deps, viewer, day);

		expect(outcome.ok && outcome.newcomers.map((row) => row.personId)).toEqual([MANFRED_ID]);
		expect(outcome.ok && outcome.ignoredNewcomers).toEqual([
			// Hidden in Immich since: kept, without a name, so it can still be taken back.
			{
				personId: DORA_ID,
				immichName: null,
				faceUrl: newcomerFace(DORA_ID),
				ignoredBy: 'u-bert',
				ignoredAt: 9
			},
			{
				personId: SANDRA_ID,
				immichName: 'Sandra',
				faceUrl: newcomerFace(SANDRA_ID),
				ignoredBy: 'u-anna',
				ignoredAt: 5
			}
		]);
	});

	it('drops an ignored face from the list once someone holds it', async () => {
		const { deps } = withNewcomers({
			contacts: [],
			ignoredNames: [
				{ householdId: 'h1', immichPersonId: BERT_ID, ignoredBy: 'u-anna', ignoredAt: 5 }
			]
		});

		const outcome = await findImmichMatches(deps, viewer, day);

		expect(outcome.ok && outcome.ignoredNewcomers).toEqual([]);
	});

	it('never offers as new a face *Find your people* proposes, so nobody is in both tabs', async () => {
		const { deps } = withNewcomers({ contacts: [contact('c-sandra', 'Sandra', 'Keller')] });

		const outcome = await findImmichMatches(deps, viewer, day);

		expect(outcome.ok && outcome.rows.map((row) => row.candidates[0].personId)).toEqual([
			SANDRA_ID
		]);
		expect(outcome.ok && outcome.newcomers.map((row) => row.personId)).toEqual([MANFRED_ID]);
	});
});
