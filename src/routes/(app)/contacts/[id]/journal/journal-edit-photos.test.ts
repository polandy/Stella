import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { Locale } from '$lib/i18n/locales';
import type { StoredPhoto } from '$lib/server/domain/media/avatars';
import type { EntryPhotoDeps } from '$lib/server/domain/media/entry-photos';
import {
	fixedClock,
	inMemoryContactDirectory,
	journalRepositoryWith,
	sequentialIds,
	somebody,
	someJournalEntry
} from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { actions } from './+page.server';

/*
 * Photos added and taken off while an entry is edited (docs/02 §2.20): `addPhoto` stores one
 * picture on the author's own entry, `edit` removes the ones the editor marked. A foreign or
 * vanished entry is answered as gone; a picture that is no image or too large is refused in the
 * reader's language and nothing is stored.
 */

const en = createTranslator('en');
const de = createTranslator('de');
const PAGE = { id: 'anna' };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]);

const jpeg = (bytes: Uint8Array<ArrayBuffer> = JPEG) =>
	new File([bytes], 'p.jpg', { type: 'image/jpeg' });

/** u1's own entry e1 (private, about Anna) with photo p1, and u2's e2 with p2. */
function entryPhotos() {
	const stored: StoredPhoto[] = [];
	const unlinked: string[] = [];
	const onEntry = new Map([
		['p1', 'e1'],
		['p2', 'e2']
	]);
	const owners: Record<string, string> = { e1: 'u1', e2: 'u2' };
	const deps: EntryPhotoDeps = {
		entries: {
			async findOwnEntry(authorId, entryId) {
				return owners[entryId] === authorId ? { contactId: 'anna', visibility: 'private' } : null;
			},
			async deleteOwnEntryPhoto(authorId, entryId, photoId) {
				if (owners[entryId] !== authorId || onEntry.get(photoId) !== entryId) return null;
				onEntry.delete(photoId);
				return { filePath: `${photoId}.jpg`, thumbPath: `${photoId}_thumb.jpg` };
			}
		},
		photos: { insert: async (p) => void stored.push(p) },
		media: {
			put: async (key) => key,
			delete: async (path) => void unlinked.push(path)
		},
		ids: sequentialIds(),
		clock: fixedClock(5000)
	};
	return { deps, stored, unlinked, onEntry };
}

describe('addPhoto', () => {
	const add = (form: FormData, photos = entryPhotos(), locale: Locale = 'en') =>
		answerOf(
			actions.addPhoto!(
				routeEvent({
					services: { media: { entryPhotoDeps: photos.deps } },
					params: PAGE,
					form,
					locale
				})
			)
		);
	const picture = (over: Record<string, string | File> = {}) =>
		formOf({ id: 'e1', image: jpeg(), thumb: jpeg(), width: '1600', height: '1200', ...over });

	it('stores the picture on the author’s own entry, with its audience', async () => {
		const photos = entryPhotos();
		const answer = await add(picture(), photos);
		expect(answer).toMatchObject({ kind: 'data' });
		expect(photos.stored).toHaveLength(1);
		expect(photos.stored[0]).toMatchObject({
			journalEntryId: 'e1',
			contactId: 'anna',
			visibility: 'private',
			createdBy: 'u1'
		});
	});

	it('answers another member’s entry, or one gone meanwhile, as gone and stores nothing', async () => {
		const photos = entryPhotos();
		expect(await add(picture({ id: 'e2' }), photos)).toEqual({
			kind: 'fail',
			status: 404,
			data: { journalError: en('errors.journal.gone') }
		});
		expect(await add(picture({ id: 'gone' }), photos, 'de')).toEqual({
			kind: 'fail',
			status: 404,
			data: { journalError: de('errors.journal.gone') }
		});
		expect(photos.stored).toEqual([]);
	});

	it('refuses a file that is no image, or too large, in the reader’s language', async () => {
		const photos = entryPhotos();
		const text = jpeg(new Uint8Array([0x68, 0x69]));
		expect(await add(picture({ image: text, thumb: text }), photos, 'de')).toEqual({
			kind: 'fail',
			status: 400,
			data: { journalError: de('errors.image.unsupportedFormat') }
		});
		expect(await add(picture({ image: jpeg(new Uint8Array(6_000_001)) }), photos)).toEqual({
			kind: 'fail',
			status: 400,
			data: { journalError: en('errors.image.tooLarge') }
		});
		expect(photos.stored).toEqual([]);
	});

	it('asks to check a form without a picture', async () => {
		expect(await add(formOf({ id: 'e1', width: '1', height: '1' }))).toEqual({
			kind: 'fail',
			status: 400,
			data: { journalError: en('errors.form.checkAndRetry') }
		});
	});

	it('sends somebody not signed in to log in', async () => {
		const answer = await answerOf(
			actions.addPhoto!(routeEvent({ services: {}, user: null, params: PAGE, form: picture() }))
		);
		expect(answer).toEqual({ kind: 'redirect', status: 302, location: '/login' });
	});
});

describe('edit, taking photos off', () => {
	function services(photos = entryPhotos()): FakeServices {
		const entries = [someJournalEntry('e1', { contactId: 'anna' })];
		return {
			story: {
				journalDeps: {
					journal: journalRepositoryWith({
						listForContactVisibleTo: async () => entries,
						updateOwn: async () => true,
						setSubjectsOwn: async ({ id }) => id,
						replaceMentions: async () => {},
						replaceTags: async () => {}
					}),
					media: { delete: async () => {} },
					ids: sequentialIds(),
					clock: fixedClock(5000)
				}
			},
			media: { entryPhotoDeps: photos.deps },
			people: {
				contactDirectoryDeps: {
					directory: inMemoryContactDirectory([somebody('anna', 'Anna Berg')])
				},
				namesakeContextDeps: {
					contextReads: {
						listTiesOfVisibleTo: async () => [],
						listMembershipsOfVisibleTo: async () => []
					},
					selfContactOf: async () => null,
					clock: fixedClock(5000)
				}
			}
		};
	}

	it('removes the marked photos of the entry with their files, and goes back', async () => {
		const photos = entryPhotos();
		const answer = await answerOf(
			actions.edit!(
				routeEvent({
					services: services(photos),
					params: PAGE,
					form: formOf({ id: 'e1', body: 'A walk', removePhotoIds: ['p1', 'p2', 'nope'] })
				})
			)
		);
		expect(answer).toEqual({ kind: 'redirect', status: 303, location: '/contacts/anna/journal' });
		// Another entry's photo and an unknown one stay where they are.
		expect([...photos.onEntry.keys()]).toEqual(['p2']);
		expect(photos.unlinked).toEqual(['p1.jpg', 'p1_thumb.jpg']);
	});

	it('removes nothing when the text is refused', async () => {
		const photos = entryPhotos();
		await answerOf(
			actions.edit!(
				routeEvent({
					services: services(photos),
					params: PAGE,
					form: formOf({ id: 'e1', body: '  ', removePhotoIds: 'p1' })
				})
			)
		);
		expect(photos.onEntry.has('p1')).toBe(true);
		expect(photos.unlinked).toEqual([]);
	});
});
