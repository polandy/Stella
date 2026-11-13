import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { immichMediaToken } from '../../../immich/media-url';
import { createImmichMediaSigner, type ImmichMediaSigner } from './signed-media';
import { fixedClock } from '../testing';
import {
	immichPhotosOfEntries,
	linkImmichPhotosToOwnEntry,
	signEntryImmichPhotos,
	unlinkImmichPhotoFromOwnEntry,
	type OwnEntryImmichPhotos
} from './entry-immich-photos';

/*
 * Immich photos on a journal entry as references (docs/02 §2.20, docs/04 ADR-132): a pick names
 * its photos by the picker's signed tokens, a reference is shown through the signed proxy, and
 * taking one off never reaches Immich.
 */

const NOW = 1_700_000_000_000;
const anna: Viewer = { id: 'u-anna', householdId: 'h1' };
const ASSET = '11111111-1111-4111-8111-111111111111';
const OTHER_ASSET = '22222222-2222-4222-8222-222222222222';

function signerAt(now = NOW): ImmichMediaSigner {
	return createImmichMediaSigner({ secret: 'test-secret', clock: fixedClock(now) });
}

/** The references in memory: entry `e1` is Anna's, nothing else is. */
function memoryEntries() {
	const linked: { entryId: string; assetId: string }[] = [];
	const entries: OwnEntryImmichPhotos = {
		async linkOwn(authorId, entryId, assetIds) {
			if (authorId !== anna.id || entryId !== 'e1') return false;
			for (const assetId of assetIds) linked.push({ entryId, assetId });
			return true;
		},
		async unlinkOwn(authorId, entryId, assetId) {
			const at = linked.findIndex((l) => l.entryId === entryId && l.assetId === assetId);
			if (authorId !== anna.id || at === -1) return false;
			linked.splice(at, 1);
			return true;
		}
	};
	return { entries, linked };
}

const libraryToken = (signer: ImmichMediaSigner, householdId = 'h1', assetId = ASSET) =>
	signer.sign({ kind: 'library', householdId, assetId, size: 'thumbnail' });

describe('linkImmichPhotosToOwnEntry', () => {
	it('refers to the photos the picker listed for the household', async () => {
		const signer = signerAt();
		const { entries, linked } = memoryEntries();
		const tokens = [await libraryToken(signer), await libraryToken(signer, 'h1', OTHER_ASSET)];

		const outcome = await linkImmichPhotosToOwnEntry({ entries, signer }, anna, {
			entryId: 'e1',
			tokens
		});

		expect(outcome).toBe('linked');
		expect(linked.map((l) => l.assetId)).toEqual([ASSET, OTHER_ASSET]);
	});

	it('refuses everything when Immich is not on the instance', async () => {
		const { linked } = memoryEntries();
		const tokens = [await libraryToken(signerAt())];

		expect(await linkImmichPhotosToOwnEntry(null, anna, { entryId: 'e1', tokens })).toBe(
			'notConfigured'
		);
		expect(linked).toEqual([]);
	});

	it('refuses a token of another household, another kind, a forged or an expired one', async () => {
		const signer = signerAt();
		const { entries, linked } = memoryEntries();
		const refused = [
			await libraryToken(signer, 'h2'),
			await signer.sign({ kind: 'face', contactId: 'c1', personId: ASSET }),
			`${(await libraryToken(signer)).split('.')[0]}.forged`,
			await libraryToken(signerAt(NOW - 25 * 60 * 60 * 1000)),
			ASSET
		];
		for (const token of refused) {
			const outcome = await linkImmichPhotosToOwnEntry({ entries, signer }, anna, {
				entryId: 'e1',
				tokens: [await libraryToken(signer), token]
			});
			expect(outcome).toBe('invalid');
		}
		expect(linked).toEqual([]);
	});

	it('refuses an empty pick and one past the picker’s limit', async () => {
		const signer = signerAt();
		const { entries } = memoryEntries();
		const token = await libraryToken(signer);
		for (const tokens of [[], Array.from({ length: 21 }, () => token)]) {
			expect(
				await linkImmichPhotosToOwnEntry({ entries, signer }, anna, { entryId: 'e1', tokens })
			).toBe('invalid');
		}
	});

	it('says gone for an entry that is not the author’s', async () => {
		const signer = signerAt();
		const { entries, linked } = memoryEntries();
		const outcome = await linkImmichPhotosToOwnEntry({ entries, signer }, anna, {
			entryId: 'e-bert',
			tokens: [await libraryToken(signer)]
		});
		expect(outcome).toBe('gone');
		expect(linked).toEqual([]);
	});
});

describe('unlinkImmichPhotoFromOwnEntry', () => {
	it('drops only Stella’s reference, needing no Immich at all', async () => {
		const { entries, linked } = memoryEntries();
		linked.push({ entryId: 'e1', assetId: ASSET }, { entryId: 'e1', assetId: OTHER_ASSET });

		// The deps carry no gateway: there is nothing that could delete in Immich.
		expect(
			await unlinkImmichPhotoFromOwnEntry({ entries }, anna.id, { entryId: 'e1', assetId: ASSET })
		).toBe(true);
		expect(linked).toEqual([{ entryId: 'e1', assetId: OTHER_ASSET }]);
		expect(
			await unlinkImmichPhotoFromOwnEntry({ entries }, anna.id, { entryId: 'e1', assetId: ASSET })
		).toBe(false);
	});
});

describe('signEntryImmichPhotos', () => {
	it('signs each reference for the reader’s household, grouped by entry in order', async () => {
		const signer = signerAt();
		const byEntry = await signEntryImmichPhotos(signer, anna, [
			{ journalEntryId: 'e1', assetId: ASSET },
			{ journalEntryId: 'e2', assetId: ASSET },
			{ journalEntryId: 'e1', assetId: OTHER_ASSET }
		]);

		expect([...byEntry.keys()]).toEqual(['e1', 'e2']);
		expect(byEntry.get('e1')!.map((p) => p.assetId)).toEqual([ASSET, OTHER_ASSET]);
		const [first] = byEntry.get('e1')!;
		for (const [url, size] of [
			[first!.thumbnailUrl, 'thumbnail'],
			[first!.previewUrl, 'preview']
		] as const) {
			const verified = await signer.verify(immichMediaToken(url!)!);
			expect(verified).toMatchObject({
				ok: true,
				media: { kind: 'library', householdId: 'h1', assetId: ASSET, size }
			});
		}
	});

	it('keeps the references without URLs when Immich is not on the instance', async () => {
		const byEntry = await signEntryImmichPhotos(null, anna, [
			{ journalEntryId: 'e1', assetId: ASSET }
		]);
		expect(byEntry.get('e1')).toEqual([{ assetId: ASSET, thumbnailUrl: null, previewUrl: null }]);
	});
});

describe('immichPhotosOfEntries', () => {
	it('reads the references of the entries asked for, and asks nothing for none', async () => {
		const asked: (readonly string[])[] = [];
		const reads = {
			async listOfEntries(_viewer: Viewer, _contactId: string, entryIds: readonly string[]) {
				asked.push(entryIds);
				return [{ journalEntryId: 'e1', assetId: ASSET }];
			}
		};
		const byEntry = await immichPhotosOfEntries({ reads, signer: null }, anna, 'c1', ['e1']);
		expect(byEntry.get('e1')).toEqual([{ assetId: ASSET, thumbnailUrl: null, previewUrl: null }]);
		expect(await immichPhotosOfEntries({ reads, signer: null }, anna, 'c1', [])).toEqual(new Map());
		expect(asked).toEqual([['e1']]);
	});
});
