import { describe, expect, it } from 'bun:test';
import type { ContactNameDeps } from '#lib/server/domain/contacts/contact-names.js';
import type { EntryImmichPhotoReads } from '#lib/server/domain/immich/entry-immich-photos.js';
import type { StreamItem } from '#lib/server/domain/stream/stream.js';
import { streamForView } from './stream-view';

/*
 * A moment as Home and a tag's page show it (docs/dev/02 §2.22.2, §2.20.2): rendered once, its
 * mentions named only as far as the viewer may see, its tags leading to the tag's page.
 */

const viewer = { id: 'u1', householdId: 'h1' };
const names: ContactNameDeps = {
	contactNames: {
		listNamesAmongVisibleTo: async (_viewer, ids) =>
			ids.filter((id) => id === 'lena').map((id) => ({ id, displayName: 'Lena' }))
	}
} as ContactNameDeps;
const ASSET = '11111111-1111-4111-8111-111111111111';
const asked: (string | null)[] = [];
const reads: EntryImmichPhotoReads = {
	async listOfEntries(_viewer, contactId, entryIds) {
		asked.push(contactId);
		return entryIds.includes('m1') ? [{ journalEntryId: 'm1', assetId: ASSET }] : [];
	}
};
const deps = { names, immichPhotos: { reads, signer: null } };

const moment = (body: string): StreamItem => ({
	kind: 'moment',
	mine: true,
	id: 'm1',
	at: 1,
	actor: { id: 'u1', name: 'One' },
	anchor: { id: 'anna', name: 'Anna', avatarPhotoId: null },
	others: [],
	entryDate: '2026-10-29',
	visibility: 'shared',
	body,
	mentions: [],
	photoIds: []
});

describe('streamForView', () => {
	it("links a moment's tag to its page and names only the people the viewer may see", async () => {
		const [view] = await streamForView(deps, viewer, [
			moment('With @{contact:lena} and @{contact:secret} up the #Gurten.')
		]);
		if (view.kind !== 'moment') throw new Error('expected a moment');
		expect(view.bodyHtml).toContain('href="/tags/gurten"');
		expect(view.bodyHtml).toContain('Lena');
		expect(view.bodyHtml).not.toContain('secret');
		expect(view.body).toBeUndefined();
	});

	it('gives a moment the Immich photos it refers to, whoever it is about (ADR-132)', async () => {
		const [view] = await streamForView(deps, viewer, [moment('At the lake')]);
		if (view.kind !== 'moment') throw new Error('expected a moment');
		expect(view.immichPhotos).toEqual([{ assetId: ASSET, thumbnailUrl: null, previewUrl: null }]);
		expect(asked).toContain(null);
	});
});
