import { describe, expect, it } from 'bun:test';
import { inEnglish, phrase } from '../../../i18n/phrase';
import { TranslatableError } from '../../../i18n/translatable';
import type { Viewer } from '../../access/visibility';
import type { OwnEntryImmichPhotos } from '../immich/entry-immich-photos';
import { createImmichMediaSigner, type ImmichMediaSigner } from '../immich/signed-media';
import { fixedClock } from '../testing';
import { writeReferringToImmich } from './immich-references';

/*
 * An entry from the composer refers to its Immich picks instead of copying them (docs/dev/04
 * ADR-132): the tokens travel in the outbox command, are read before the entry is written, and
 * the references land on whatever entry the write produced.
 */

const NOW = 1_700_000_000_000;
const anna: Viewer = { id: 'u-anna', householdId: 'h1' };
const ASSET = '11111111-1111-4111-8111-111111111111';
const signer: ImmichMediaSigner = createImmichMediaSigner({
	secret: 'test-secret',
	clock: fixedClock(NOW)
});
const token = (householdId = 'h1') =>
	signer.sign({ kind: 'library', householdId, assetId: ASSET, size: 'thumbnail' });

function recorded() {
	const linked: { authorId: string; entryId: string; assetIds: readonly string[] }[] = [];
	const writes: string[] = [];
	const entries: OwnEntryImmichPhotos = {
		async linkOwn(authorId, entryId, assetIds) {
			linked.push({ authorId, entryId, assetIds });
			return true;
		},
		async unlinkOwn() {
			return false;
		}
	};
	const write = async () => {
		writes.push('e1');
		return { entryId: 'e1', anchorContactId: 'c1' };
	};
	return { entries, linked, writes, write };
}

describe('writeReferringToImmich', () => {
	it('writes the entry, then refers to the picked photos from it', async () => {
		const { entries, linked, write } = recorded();
		const result = await writeReferringToImmich({ entries, signer }, anna, [await token()], write);
		expect(result).toEqual({ entryId: 'e1', anchorContactId: 'c1' });
		expect(linked).toEqual([{ authorId: anna.id, entryId: 'e1', assetIds: [ASSET] }]);
	});

	it('only writes when nothing was picked, Immich or not', async () => {
		for (const tokens of [undefined, []]) {
			const { entries, linked, writes, write } = recorded();
			await writeReferringToImmich(null, anna, tokens, write);
			await writeReferringToImmich({ entries, signer }, anna, tokens, write);
			expect(writes).toHaveLength(2);
			expect(linked).toEqual([]);
		}
	});

	it('refuses before writing anything when a token is not the household’s', async () => {
		const { entries, linked, writes, write } = recorded();
		const refused = writeReferringToImmich({ entries, signer }, anna, [await token('h2')], write);
		await expect(refused).rejects.toBeInstanceOf(TranslatableError);
		await expect(refused).rejects.toThrow(inEnglish(phrase('errors.photo.fromImmichGone')));
		expect(writes).toEqual([]);
		expect(linked).toEqual([]);
	});

	it('refuses before writing anything when Immich is no longer on the instance', async () => {
		const { writes, write } = recorded();
		const refused = writeReferringToImmich(null, anna, [await token()], write);
		await expect(refused).rejects.toThrow(inEnglish(phrase('errors.photo.immichNotConnected')));
		expect(writes).toEqual([]);
	});
});
