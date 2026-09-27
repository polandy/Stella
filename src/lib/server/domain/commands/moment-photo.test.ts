import { describe, expect, it } from 'bun:test';
import { createTranslator } from '../../../i18n/translate';
import type { StoredPhoto } from '../media/avatars';
import type { CommandReceipt } from './dispatch';
import { attachMomentPhoto, MomentNotDeliveredError, type MomentPhotoDeps } from './moment-photo';

/*
 * A photo sent after its moment (docs/concepts/offline-capture.md §4.2): it names the moment
 * by its command id, and lands on the journal entry that moment went into — only if that
 * moment is the same member's, was applied, and its entry is still theirs.
 */

const t = createTranslator('en');
const actor = { userId: 'u1', householdId: 'h1' };
// A 1×1 JPEG's magic bytes are enough for the upload check.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

const applied: CommandReceipt = {
	id: 'm1',
	memberId: 'u1',
	householdId: 'h1',
	type: 'moment.capture',
	status: 'applied',
	result: {
		entryId: 'e1',
		anchorContactId: 'julia',
		mentionedContactIds: [],
		createdContactIds: [],
		linkSuggestion: null,
		visibility: 'private'
	},
	claimedAt: 1
};

function fakes(receipt: CommandReceipt | null = applied, owned = true) {
	const stored: StoredPhoto[] = [];
	const deps: MomentPhotoDeps = {
		receipts: { find: async (id) => (receipt && receipt.id === id ? receipt : null) },
		entries: { ownsEntry: async (author, entry) => owned && author === 'u1' && entry === 'e1' },
		photos: {
			photos: { insert: async (p: StoredPhoto) => void stored.push(p) } as MomentPhotoDeps['photos']['photos'],
			media: { put: async (name: string) => `/media/${name}`, delete: async () => {} } as unknown as MomentPhotoDeps['photos']['media'],
			ids: { next: () => 'ph1' },
			clock: { now: () => 5 }
		}
	};
	return { deps, stored };
}

const payload = { momentId: 'm1', image: JPEG, thumb: JPEG, width: 4, height: 3 };

describe('attachMomentPhoto', () => {
	it('puts the photo on the entry the moment went into, with the moment’s visibility', async () => {
		const f = fakes();
		expect(await attachMomentPhoto(f.deps, actor, payload)).toBe('ph1');
		expect(f.stored).toHaveLength(1);
		expect(f.stored[0]).toMatchObject({ journalEntryId: 'e1', contactId: 'julia', visibility: 'private', createdBy: 'u1' });
	});

	it('refuses a photo for a moment that is not this member’s applied moment, storing nothing', async () => {
		for (const receipt of [
			null,
			{ ...applied, memberId: 'u2' },
			{ ...applied, status: 'pending' as const, result: null },
			{ ...applied, type: 'moment.photo' as const }
		]) {
			const f = fakes(receipt);
			const refusal = attachMomentPhoto(f.deps, actor, payload);
			await expect(refusal).rejects.toBeInstanceOf(MomentNotDeliveredError);
			await refusal.catch((e: MomentNotDeliveredError) => expect(e.phrase(t)).toContain('moment'));
			expect(f.stored).toHaveLength(0);
		}
	});

	it('refuses a photo whose entry was removed in the meantime', async () => {
		const f = fakes(applied, false);
		await expect(attachMomentPhoto(f.deps, actor, payload)).rejects.toBeInstanceOf(MomentNotDeliveredError);
		expect(f.stored).toHaveLength(0);
	});
});
