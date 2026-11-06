import { describe, expect, it } from 'bun:test';
import type { CommandAnswer, JsonCommand } from '../commands/commands';
import { discard, hold, queue, settle, takeBatch } from './outbox';
import { photoAnswer, settlePhoto, takePhoto } from './outbox-photos';

/*
 * The photos kept with an outbox item (docs/02 §2.18.1): sent one at a time after the item,
 * and dropped only once Stella has each.
 */

const moment = (id: string, body = `moment ${id}`): JsonCommand => ({
	id,
	type: 'moment.capture',
	payload: { body, entryDate: '2026-09-27', visibility: 'shared', newPeople: [] },
	issuedAt: 1
});

describe('photos kept with a moment', () => {
	const photo = (id: string) => ({
		id,
		image: new Blob(['i']),
		thumb: new Blob(['t']),
		width: 4,
		height: 3
	});
	const withPhotos = (id: string, ...photoIds: string[]) =>
		queue([], { command: moment(id), memberId: 'u1', savedAt: 1, photos: photoIds.map(photo) });

	it('keeps a delivered moment until its photos are sent too, and never sends it again', () => {
		let items = settle(takeBatch(withPhotos('a', 'p1', 'p2'), 'u1', 10).items, [
			{ id: 'a', status: 'applied', result: {} }
		]);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ delivered: true, state: 'pending' });
		expect(takeBatch(items, 'u1', 10).batch).toEqual([]);

		const first = takePhoto(items, 'u1')!;
		expect(first.upload).toMatchObject({
			parentId: 'a',
			type: 'moment.photo',
			photo: { id: 'p1' }
		});
		expect(first.items[0].state).toBe('sending');
		items = settlePhoto(first.items, 'a', 'p1', { id: 'p1', status: 'applied', result: 'ph1' });

		const second = takePhoto(items, 'u1')!;
		expect(second.upload.photo.id).toBe('p2');
		expect(
			settlePhoto(second.items, 'a', 'p2', { id: 'p2', status: 'applied', result: 'ph2' })
		).toEqual([]);
	});

	it('sends a kept photo with the capture date it was kept with', () => {
		const dated = { ...photo('p1'), takenAt: '2026-09-27T18:04:00+02:00' };
		const kept = queue([], { command: moment('a'), memberId: 'u1', savedAt: 1, photos: [dated] });
		const delivered = settle(takeBatch(kept, 'u1', 10).items, [
			{ id: 'a', status: 'applied', result: {} }
		]);
		expect(takePhoto(delivered, 'u1')?.upload.photo.takenAt).toBe('2026-09-27T18:04:00+02:00');
	});

	it('uploads a photo kept for a gallery into that gallery', () => {
		const gallery = queue([], {
			command: {
				id: 'g',
				type: 'gallery.add',
				payload: { contactId: 'julia', visibility: 'shared' },
				issuedAt: 1
			},
			memberId: 'u1',
			savedAt: 1,
			photos: [photo('p1')]
		});
		const delivered = settle(takeBatch(gallery, 'u1', 10).items, [
			{ id: 'g', status: 'applied', result: {} }
		]);
		expect(takePhoto(delivered, 'u1')?.upload).toMatchObject({
			parentId: 'g',
			type: 'gallery.photo'
		});
	});

	it('uploads a photo kept for a circle into that circle’s photos', () => {
		const upload = queue([], {
			command: {
				id: 'k',
				type: 'circleGallery.add',
				payload: { circleId: 'class-1b', role: 'Student', visibility: 'shared' },
				issuedAt: 1
			},
			memberId: 'u1',
			savedAt: 1,
			photos: [photo('p1')]
		});
		const delivered = settle(takeBatch(upload, 'u1', 10).items, [
			{ id: 'k', status: 'applied', result: {} }
		]);
		expect(takePhoto(delivered, 'u1')?.upload).toMatchObject({
			parentId: 'k',
			type: 'circleGallery.photo'
		});
	});

	it('does not upload a photo before its moment has arrived', () => {
		expect(takePhoto(withPhotos('a', 'p1'), 'u1')).toBeNull();
	});

	it('keeps the photo waiting when its upload got no answer or a "not now"', () => {
		const delivered = settle(takeBatch(withPhotos('a', 'p1'), 'u1', 10).items, [
			{ id: 'a', status: 'applied', result: {} }
		]);
		const lost = settlePhoto(takePhoto(delivered, 'u1')!.items, 'a', 'p1', null);
		expect(lost[0]).toMatchObject({ state: 'pending', delivered: true });
		expect(lost[0].photos.map((p) => p.id)).toEqual(['p1']);
		const busy = settlePhoto(takePhoto(lost, 'u1')!.items, 'a', 'p1', {
			id: 'p1',
			status: 'failed'
		});
		expect(busy[0].state).toBe('pending');
	});

	it('shows a refused photo with the reason; a delivered moment can be discarded but not edited', () => {
		const delivered = settle(takeBatch(withPhotos('a', 'p1'), 'u1', 10).items, [
			{ id: 'a', status: 'applied', result: {} }
		]);
		const refused = settlePhoto(takePhoto(delivered, 'u1')!.items, 'a', 'p1', {
			id: 'p1',
			status: 'refused',
			reason: 'Unsupported image format.'
		});
		expect(refused[0]).toMatchObject({
			state: 'refused',
			reason: 'Unsupported image format.',
			delivered: true
		});
		expect(takePhoto(refused, 'u1')).toBeNull();
		expect(hold(refused, 'a')).toBeNull();
		expect(discard(refused, 'a')).toEqual([]);
	});
});

describe('photoAnswer', () => {
	const TOO_LARGE = 'Too large for this server';
	const applied: CommandAnswer = { id: 'p1', status: 'applied', result: null };

	it('takes Stella’s own answer when the upload got through', () => {
		expect(photoAnswer('p1', 200, applied, TOO_LARGE)).toEqual(applied);
	});

	it('refuses a photo the server turned away as too large, rather than retrying it for ever', () => {
		expect(photoAnswer('p1', 413, null, TOO_LARGE)).toEqual({
			id: 'p1',
			status: 'refused',
			reason: TOO_LARGE
		});
	});

	it('leaves any other failure waiting, since it may pass on the next try', () => {
		expect(photoAnswer('p1', 502, null, TOO_LARGE)).toBeNull();
		expect(photoAnswer('p1', 500, null, TOO_LARGE)).toBeNull();
	});
});
