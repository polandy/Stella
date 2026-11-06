import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { ImmichPerson } from './gateway';
import type { ImmichHolder } from './links';
import type { ImmichNameIgnore } from './name-ignores';
import { newcomerRows } from './newcomer-rows';
import type { ImmichMediaSigner } from './signed-media';

/*
 * The rows of *New from Immich* built from what was read already (docs/02 §2.24.7). The tab as a
 * whole is `matching.test.ts`'s; these pin the comparison step's edges: a similar person whose
 * face Immich no longer lists or never named, and the context read for the similar alone.
 */

const viewer: Viewer = { id: 'u1', householdId: 'h1' };
const day = { selfContactId: null, today: '2026-11-06' };

/** A signer that writes what it signed, so a test reads it back off the URL. */
const signer: ImmichMediaSigner = {
	sign: async (media) =>
		`${media.kind}~${'contactId' in media ? media.contactId : media.householdId}~${'personId' in media ? media.personId : media.assetId}`,
	verify: async () => ({ ok: false, reason: 'invalid' })
};
const face = (token: string) => `/media/immich/${encodeURIComponent(token)}`;

const someone = (id: string, firstName: string) => ({
	id,
	displayName: firstName,
	firstName,
	lastName: null,
	nickname: null,
	avatarPhotoId: null,
	description: null
});

function rows(read: {
	holders?: [string, ImmichHolder][];
	linked?: string[];
	people?: ImmichPerson[];
	nameIgnores?: ImmichNameIgnore[];
}) {
	const asked: string[][] = [];
	const result = newcomerRows(
		{
			signer,
			publicUrl: 'https://photos.example.org/',
			contextReads: {
				listTiesOfVisibleTo: async (_viewer, ids) => {
					asked.push([...ids]);
					return [];
				},
				listMembershipsOfVisibleTo: async () => []
			}
		},
		viewer,
		day,
		{
			newcomers: [{ personId: 'im-anna', name: 'Anna' }],
			counts: new Map([['im-anna', 12]]),
			contacts: [someone('c-anna', 'Anna'), someone('c-bert', 'Bert')],
			linkedContactIds: new Set(read.linked ?? []),
			holders: new Map(read.holders ?? []),
			personById: new Map((read.people ?? []).map((p) => [p.id, p])),
			nameIgnores: read.nameIgnores ?? []
		}
	);
	return { result, asked };
}

describe('newcomerRows', () => {
	it('builds a row with its count, its face signed for the household and its way to Immich', async () => {
		const { result } = rows({});
		const { newcomers } = await result;

		expect(newcomers).toHaveLength(1);
		expect(newcomers[0]).toMatchObject({
			personId: 'im-anna',
			name: 'Anna',
			photoCount: 12,
			faceUrl: face('newcomer~h1~im-anna'),
			openUrl: 'https://photos.example.org/people/im-anna'
		});
	});

	it('reads the context of the similar people alone', async () => {
		const { result, asked } = rows({});
		await result;

		expect(asked).toEqual([['c-anna']]);
	});

	it('offers a similar person with no face and nothing known about them as plainly that', async () => {
		const { newcomers } = await rows({}).result;

		expect(newcomers[0]?.similar).toEqual([
			{
				contact: { id: 'c-anna', displayName: 'Anna', avatarPhotoId: null },
				description: null,
				context: null,
				linkedFace: null
			}
		]);
	});

	it('shows the face a similar person holds, without a name when Immich gives the face none', async () => {
		const { newcomers } = await rows({
			linked: ['c-anna'],
			holders: [['im-old', { contactId: 'c-anna', name: 'Anna' }]],
			people: [{ id: 'im-old', name: '', hidden: false }]
		}).result;

		expect(newcomers[0]?.similar[0]?.linkedFace).toEqual({
			name: null,
			faceUrl: face('face~c-anna~im-old')
		});
	});

	it('still says a similar person is linked when Immich no longer lists their face', async () => {
		const { newcomers } = await rows({ linked: ['c-anna'] }).result;

		expect(newcomers[0]?.similar[0]?.linkedFace).toEqual({ name: null, faceUrl: null });
	});

	it('lists ignored faces newest first, dropping one somebody holds by now', async () => {
		const ignore = (immichPersonId: string, ignoredAt: number): ImmichNameIgnore => ({
			householdId: 'h1',
			immichPersonId,
			ignoredBy: 'u2',
			ignoredAt
		});
		const { ignoredNewcomers } = await rows({
			holders: [['im-held', { contactId: 'c-bert', name: 'Bert' }]],
			people: [{ id: 'im-new', name: 'Nora', hidden: false }],
			nameIgnores: [ignore('im-old', 1), ignore('im-held', 2), ignore('im-new', 3)]
		}).result;

		expect(ignoredNewcomers).toEqual([
			{
				personId: 'im-new',
				immichName: 'Nora',
				faceUrl: face('newcomer~h1~im-new'),
				ignoredBy: 'u2',
				ignoredAt: 3
			},
			{
				personId: 'im-old',
				immichName: null,
				faceUrl: face('newcomer~h1~im-old'),
				ignoredBy: 'u2',
				ignoredAt: 1
			}
		]);
	});
});
