import { describe, expect, it } from 'bun:test';
import type { DeletedPhotoFiles, StoredPhoto } from './avatars';
import {
	addPhotoToOwnEntry,
	removePhotoFromOwnEntry,
	type EntryPhotoDeps,
	type OwnEntry
} from './entry-photos';
import { InvalidImageError, type ImageUpload } from './journal-photos';

/*
 * Adding and removing photos while editing a journal entry (docs/02 §2.20): only the entry's
 * author may, a new photo inherits the entry's anchor and audience, and removing deletes the row
 * before the bytes. Tested over fake ports.
 */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function upload(over: Partial<ImageUpload> = {}): ImageUpload {
	return { image: JPEG, thumb: JPEG, width: 1600, height: 1200, ...over };
}

const author = { userId: 'u1', householdId: 'h1' };

function deps(entries: Record<string, OwnEntry & { authorId: string }> = {}) {
	const stored: StoredPhoto[] = [];
	const puts: string[] = [];
	const deleted: string[] = [];
	const photoFiles = new Map<string, DeletedPhotoFiles & { entryId: string; authorId: string }>();
	const d: EntryPhotoDeps = {
		entries: {
			async findOwnEntry(authorId, entryId) {
				const entry = entries[entryId];
				return entry && entry.authorId === authorId
					? { contactId: entry.contactId, visibility: entry.visibility }
					: null;
			},
			async deleteOwnEntryPhoto(authorId, entryId, photoId) {
				const files = photoFiles.get(photoId);
				if (!files || files.entryId !== entryId || files.authorId !== authorId) return null;
				photoFiles.delete(photoId);
				return { filePath: files.filePath, thumbPath: files.thumbPath };
			}
		},
		photos: {
			async insert(p) {
				stored.push(p);
			}
		},
		media: {
			async put(key) {
				puts.push(key);
				return `/m/${key}`;
			},
			async delete(path) {
				deleted.push(path);
			}
		},
		ids: { next: () => 'p-new' },
		clock: { now: () => 5000 }
	};
	return { d, stored, puts, deleted, photoFiles };
}

describe('addPhotoToOwnEntry', () => {
	it('stores the photo on the entry, with its anchor and its audience', async () => {
		const { d, stored, puts } = deps({
			e1: { authorId: 'u1', contactId: 'anchor', visibility: 'private' }
		});
		expect(await addPhotoToOwnEntry(d, author, { entryId: 'e1', upload: upload() })).toBe('p-new');
		expect(puts).toEqual(['p-new.jpg', 'p-new_thumb.jpg']);
		expect(stored[0]).toMatchObject({
			contactId: 'anchor',
			journalEntryId: 'e1',
			createdBy: 'u1',
			visibility: 'private'
		});
	});

	it('adds nothing to an entry that is gone or someone else’s', async () => {
		const { d, stored, puts } = deps({
			e1: { authorId: 'u2', contactId: 'c', visibility: 'shared' }
		});
		expect(await addPhotoToOwnEntry(d, author, { entryId: 'e1', upload: upload() })).toBeNull();
		expect(await addPhotoToOwnEntry(d, author, { entryId: 'gone', upload: upload() })).toBeNull();
		expect(stored).toEqual([]);
		expect(puts).toEqual([]);
	});

	it('refuses bytes that are no image, or too large, and stores nothing', async () => {
		const { d, stored, puts } = deps({
			e1: { authorId: 'u1', contactId: 'c', visibility: 'shared' }
		});
		const text = new Uint8Array([0x68, 0x69, 0x21, 0x0a]);
		await expect(
			addPhotoToOwnEntry(d, author, { entryId: 'e1', upload: upload({ image: text, thumb: text }) })
		).rejects.toBeInstanceOf(InvalidImageError);
		await expect(
			addPhotoToOwnEntry(d, author, {
				entryId: 'e1',
				upload: upload({ image: new Uint8Array(6_000_001) })
			})
		).rejects.toBeInstanceOf(InvalidImageError);
		await expect(
			addPhotoToOwnEntry(d, author, { entryId: 'e1', upload: upload({ thumb: PNG }) })
		).rejects.toBeInstanceOf(InvalidImageError);
		expect(stored).toEqual([]);
		expect(puts).toEqual([]);
	});
});

describe('removePhotoFromOwnEntry', () => {
	it('deletes the photo and then both its files', async () => {
		const { d, deleted, photoFiles } = deps();
		photoFiles.set('p1', { entryId: 'e1', authorId: 'u1', filePath: '/m/a', thumbPath: '/m/b' });
		expect(await removePhotoFromOwnEntry(d, 'u1', { entryId: 'e1', photoId: 'p1' })).toBe(true);
		expect(photoFiles.has('p1')).toBe(false);
		expect(deleted).toEqual(['/m/a', '/m/b']);
	});

	it('leaves a photo of another entry or another author alone', async () => {
		const { d, deleted, photoFiles } = deps();
		photoFiles.set('p1', { entryId: 'e1', authorId: 'u2', filePath: '/m/a', thumbPath: '/m/b' });
		expect(await removePhotoFromOwnEntry(d, 'u1', { entryId: 'e1', photoId: 'p1' })).toBe(false);
		expect(await removePhotoFromOwnEntry(d, 'u2', { entryId: 'e2', photoId: 'p1' })).toBe(false);
		expect(photoFiles.has('p1')).toBe(true);
		expect(deleted).toEqual([]);
	});
});
