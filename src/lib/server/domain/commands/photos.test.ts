import { describe, expect, it } from 'bun:test';
import { createTranslator } from '../../../i18n/translate';
import type { Contact } from '../contacts/contacts';
import type { StoredPhoto } from '../media/avatars';
import type { CommandReceipt } from './dispatch';
import type { StoredCirclePhoto } from '../circles/circle-photos';
import {
	attachCirclePhoto,
	attachGalleryPhoto,
	attachMomentPhoto,
	PhotoParentGoneError,
	type CirclePhotoUploadDeps,
	type GalleryPhotoDeps,
	type MomentPhotoDeps
} from './photos';

/*
 * A photo sent after the command it belongs to (docs/04 ADR-111): it
 * names that command by id, and lands where the command's receipt says — on the journal entry
 * a moment or a journal-page entry went into, or in the gallery of the person a gallery upload
 * was for. Only if that command is the same member's, was applied, and where it points is
 * still there for them.
 */

const t = createTranslator('en');
const actor = { userId: 'u1', householdId: 'h1', locale: 'en' as const };
// A 1×1 JPEG's magic bytes are enough for the upload check.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

const moment: CommandReceipt = {
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

const pageEntry: CommandReceipt = {
	...moment,
	type: 'journal.write',
	result: { entryId: 'e1', anchorContactId: 'julia', visibility: 'shared' }
};

const gallery: CommandReceipt = {
	...moment,
	type: 'gallery.add',
	result: { contactId: 'julia', visibility: 'private' }
};

function photoDeps(stored: StoredPhoto[]) {
	return {
		photos: {
			insert: async (p: StoredPhoto) => void stored.push(p)
		} as MomentPhotoDeps['photos']['photos'],
		media: {
			put: async (name: string) => `/media/${name}`,
			delete: async () => {}
		} as unknown as MomentPhotoDeps['photos']['media'],
		ids: { next: () => 'ph1' },
		clock: { now: () => Date.UTC(2026, 9, 4) }
	};
}

function momentFakes(receipt: CommandReceipt | null = moment, owned = true) {
	const stored: StoredPhoto[] = [];
	const deps: MomentPhotoDeps = {
		receipts: { find: async (id) => (receipt && receipt.id === id ? receipt : null) },
		entries: { ownsEntry: async (author, entry) => owned && author === 'u1' && entry === 'e1' },
		photos: photoDeps(stored)
	};
	return { deps, stored };
}

function galleryFakes(receipt: CommandReceipt | null = gallery, visible = true) {
	const stored: StoredPhoto[] = [];
	const deps: GalleryPhotoDeps = {
		receipts: { find: async (id) => (receipt && receipt.id === id ? receipt : null) },
		contacts: {
			findByIdVisibleTo: async (viewer, id) =>
				visible && viewer.id === 'u1' && id === 'julia' ? ({ id } as Contact) : null
		},
		photos: photoDeps(stored)
	};
	return { deps, stored };
}

const payload = { parentId: 'm1', image: JPEG, thumb: JPEG, width: 4, height: 3 };
/** A photo whose EXIF named the moment it was taken (docs/02 §2.14). */
const TAKEN_AT = '2026-09-27T18:04:00+02:00';

describe('attachMomentPhoto', () => {
	it('puts the photo on the entry the moment went into, with the moment’s visibility', async () => {
		const f = momentFakes();
		expect(await attachMomentPhoto(f.deps, actor, payload)).toBe('ph1');
		expect(f.stored).toHaveLength(1);
		expect(f.stored[0]).toMatchObject({
			journalEntryId: 'e1',
			contactId: 'julia',
			visibility: 'private',
			createdBy: 'u1'
		});
	});

	it('keeps the capture date the photo came with', async () => {
		const f = momentFakes();
		await attachMomentPhoto(f.deps, actor, { ...payload, takenAt: TAKEN_AT });
		expect(f.stored[0]?.takenAt).toBe(TAKEN_AT);
	});

	it('puts the photo on the entry written on the journal page, with that entry’s visibility', async () => {
		const f = momentFakes(pageEntry);
		expect(await attachMomentPhoto(f.deps, actor, payload)).toBe('ph1');
		expect(f.stored[0]).toMatchObject({
			journalEntryId: 'e1',
			contactId: 'julia',
			visibility: 'shared'
		});
	});

	it('refuses a photo for what is not this member’s applied entry, storing nothing', async () => {
		for (const receipt of [
			null,
			{ ...moment, memberId: 'u2' },
			{ ...moment, status: 'pending' as const, result: null },
			{ ...moment, type: 'moment.photo' as const },
			gallery
		]) {
			const f = momentFakes(receipt);
			const refusal = attachMomentPhoto(f.deps, actor, payload);
			await expect(refusal).rejects.toBeInstanceOf(PhotoParentGoneError);
			await refusal.catch((e: PhotoParentGoneError) => expect(e.phrase(t)).toContain('photo'));
			expect(f.stored).toHaveLength(0);
		}
	});

	it('refuses a photo whose entry was removed in the meantime', async () => {
		const f = momentFakes(moment, false);
		await expect(attachMomentPhoto(f.deps, actor, payload)).rejects.toBeInstanceOf(
			PhotoParentGoneError
		);
		expect(f.stored).toHaveLength(0);
	});
});

describe('attachGalleryPhoto', () => {
	it('puts the photo in the person’s gallery, in no entry, with the upload’s visibility', async () => {
		const f = galleryFakes();
		expect(await attachGalleryPhoto(f.deps, actor, payload)).toBe('ph1');
		expect(f.stored).toHaveLength(1);
		expect(f.stored[0]).toMatchObject({
			journalEntryId: null,
			contactId: 'julia',
			visibility: 'private',
			createdBy: 'u1'
		});
		expect(f.stored[0]?.takenAt).toBeNull();
	});

	it('keeps the capture date the photo came with', async () => {
		const f = galleryFakes();
		await attachGalleryPhoto(f.deps, actor, { ...payload, takenAt: TAKEN_AT });
		expect(f.stored[0]?.takenAt).toBe(TAKEN_AT);
	});

	it('refuses a photo for what is not this member’s applied gallery upload, storing nothing', async () => {
		for (const receipt of [
			null,
			{ ...gallery, memberId: 'u2' },
			{ ...gallery, status: 'pending' as const, result: null },
			moment
		]) {
			const f = galleryFakes(receipt);
			await expect(attachGalleryPhoto(f.deps, actor, payload)).rejects.toBeInstanceOf(
				PhotoParentGoneError
			);
			expect(f.stored).toHaveLength(0);
		}
	});

	it('refuses a photo for a person the member can no longer see', async () => {
		const f = galleryFakes(gallery, false);
		await expect(attachGalleryPhoto(f.deps, actor, payload)).rejects.toBeInstanceOf(
			PhotoParentGoneError
		);
		expect(f.stored).toHaveLength(0);
	});
});

const circleUpload: CommandReceipt = {
	...moment,
	type: 'circleGallery.add',
	result: { circleId: 'class-1b', role: 'Student', visibility: 'private' }
};

function circleFakes(receipt: CommandReceipt | null = circleUpload, visible = true) {
	const stored: StoredCirclePhoto[] = [];
	const deps: CirclePhotoUploadDeps = {
		receipts: { find: async (id) => (receipt && receipt.id === id ? receipt : null) },
		circles: {
			getVisibleTo: async (viewer, id) =>
				visible && viewer.id === 'u1' && id === 'class-1b' ? ({ id } as never) : null
		},
		photos: {
			circlePhotos: {
				insert: async (p: StoredCirclePhoto) => void stored.push(p)
			} as CirclePhotoUploadDeps['photos']['circlePhotos'],
			media: {
				put: async (name: string) => `/media/${name}`,
				delete: async () => {}
			} as unknown as CirclePhotoUploadDeps['photos']['media'],
			ids: { next: () => 'ph1' },
			clock: { now: () => Date.UTC(2026, 9, 4) }
		}
	};
	return { deps, stored };
}

describe('attachCirclePhoto', () => {
	it('puts the photo in the circle, with the upload’s role and visibility', async () => {
		const f = circleFakes();
		expect(await attachCirclePhoto(f.deps, actor, payload)).toBe('ph1');
		expect(f.stored).toHaveLength(1);
		expect(f.stored[0]).toMatchObject({
			circleId: 'class-1b',
			circleRole: 'Student',
			visibility: 'private',
			createdBy: 'u1'
		});
		expect(f.stored[0]?.viewPath).toBeNull();
	});

	it('keeps the 1600 px view a large group photo came with', async () => {
		const f = circleFakes();
		await attachCirclePhoto(f.deps, actor, { ...payload, width: 4096, view: payload.image });
		expect(f.stored[0]).toMatchObject({ width: 4096, viewPath: '/media/ph1_view.jpg' });
	});

	it('keeps the capture date the group photo came with', async () => {
		const f = circleFakes();
		await attachCirclePhoto(f.deps, actor, { ...payload, takenAt: TAKEN_AT });
		expect(f.stored[0]?.takenAt).toBe(TAKEN_AT);
	});

	it('refuses a photo for what is not this member’s applied circle upload, storing nothing', async () => {
		for (const receipt of [null, { ...circleUpload, memberId: 'u2' }, gallery]) {
			const f = circleFakes(receipt);
			await expect(attachCirclePhoto(f.deps, actor, payload)).rejects.toBeInstanceOf(
				PhotoParentGoneError
			);
			expect(f.stored).toHaveLength(0);
		}
	});

	it('refuses a photo for a circle the member can no longer see', async () => {
		const f = circleFakes(circleUpload, false);
		await expect(attachCirclePhoto(f.deps, actor, payload)).rejects.toBeInstanceOf(
			PhotoParentGoneError
		);
		expect(f.stored).toHaveLength(0);
	});
});
