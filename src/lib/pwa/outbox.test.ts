import { describe, expect, it } from 'bun:test';
import type { CommandAnswer, JsonCommand } from '../commands/commands';
import {
	deliveryFor,
	deliveryLeftOver,
	discard,
	discardAllOf,
	hold,
	isKept,
	photoAnswer,
	queue,
	recover,
	release,
	revise,
	settle,
	settlePhoto,
	takeBatch,
	takePhoto,
	unsend,
	type OutboxItem
} from './outbox';

/*
 * The outbox (docs/concepts/offline-capture.md §4): what a phone holds back while Stella is out
 * of reach. Pure — the IndexedDB store and the fetch that sends are adapters around it. The
 * rule it keeps: nothing leaves until Stella has confirmed it or the member discards it, and an
 * item being edited is never sent from under the editor.
 */

const moment = (id: string, body = `moment ${id}`): JsonCommand => ({
	id,
	type: 'moment.capture',
	payload: { body, entryDate: '2026-09-27', visibility: 'shared', newPeople: [] },
	issuedAt: 1
});

const add = (items: OutboxItem[], id: string, memberId = 'u1') =>
	queue(items, { command: moment(id), memberId, savedAt: 1 });

const states = (items: OutboxItem[]) => items.map((i) => [i.command.id, i.state]);

describe('queue and takeBatch', () => {
	it('sends a member’s pending items in the order they were written, and marks them in flight', () => {
		const items = add(add(add([], 'a'), 'b', 'u2'), 'c');
		const { items: after, batch } = takeBatch(items, 'u1', 10);

		expect(batch.map((c) => c.id)).toEqual(['a', 'c']);
		expect(states(after)).toEqual([
			['a', 'sending'],
			['b', 'pending'],
			['c', 'sending']
		]);
	});

	it('sends no more than the batch allows; the rest wait for the next round', () => {
		const items = add(add(add([], 'a'), 'b'), 'c');
		expect(takeBatch(items, 'u1', 2).batch.map((c) => c.id)).toEqual(['a', 'b']);
	});

	it('does not send an item that is being edited, or one Stella refused', () => {
		let items = add(add(add([], 'a'), 'b'), 'c');
		items = hold(items, 'a')!;
		items = settle(takeBatch(items, 'u1', 10).items, [
			{ id: 'b', status: 'refused', reason: 'nobody' },
			{ id: 'c', status: 'busy' }
		]);
		expect(takeBatch(items, 'u1', 10).batch.map((c) => c.id)).toEqual(['c']);
	});
});

describe('settle', () => {
	it('lets go of what Stella applied, keeps what it refused with the reason, and retries the rest', () => {
		const sent = takeBatch(add(add(add(add([], 'a'), 'b'), 'c'), 'd'), 'u1', 10).items;
		const answers: CommandAnswer[] = [
			{ id: 'a', status: 'applied', result: {} },
			{ id: 'b', status: 'refused', reason: 'Julia was deleted' },
			{ id: 'c', status: 'failed' }
			// 'd' went unanswered.
		];
		const items = settle(sent, answers);

		expect(states(items)).toEqual([
			['b', 'refused'],
			['c', 'pending'],
			['d', 'pending']
		]);
		expect(items[0].reason).toBe('Julia was deleted');
	});

	it('puts everything in flight back when the request never got an answer', () => {
		const sent = takeBatch(add(add([], 'a'), 'b'), 'u1', 1).items;
		expect(states(unsend(sent))).toEqual([
			['a', 'pending'],
			['b', 'pending']
		]);
	});
});

describe('editing before it is sent', () => {
	it('holds an item while it is edited and replaces its content, keeping its id', () => {
		let items = add([], 'a');
		items = hold(items, 'a')!;
		expect(states(items)).toEqual([['a', 'held']]);

		items = revise(items, 'a', { ...moment('a').payload, body: 'better @Julia' }, 'new-id')!;
		expect(items[0].command.id).toBe('a');
		expect(items[0].command.payload).toMatchObject({ body: 'better @Julia' });
		expect(items[0].state).toBe('pending');
	});

	it('gives a refused item a fresh id when it is corrected, so it is a new command', () => {
		let items = settle(takeBatch(add([], 'a'), 'u1', 10).items, [
			{ id: 'a', status: 'refused', reason: 'nobody' }
		]);
		items = revise(hold(items, 'a')!, 'a', { ...moment('a').payload, body: 'with @Julia' }, 'a2')!;

		expect(items[0].command.id).toBe('a2');
		expect(items[0].state).toBe('pending');
		expect(items[0].reason).toBeNull();
	});

	it('returns a held item to where it was when the edit is abandoned', () => {
		let items = settle(takeBatch(add(add([], 'a'), 'b'), 'u1', 10).items, [
			{ id: 'a', status: 'refused', reason: 'nobody' },
			{ id: 'b', status: 'failed' }
		]);
		items = release(release(hold(hold(items, 'a')!, 'b')!, 'a'), 'b');
		expect(states(items)).toEqual([
			['a', 'refused'],
			['b', 'pending']
		]);
	});

	it('will not hold or discard an item that is on its way, so an edit cannot be lost in flight', () => {
		const sent = takeBatch(add([], 'a'), 'u1', 10).items;
		expect(hold(sent, 'a')).toBeNull();
		expect(discard(sent, 'a')).toBeNull();
		expect(revise(sent, 'a', moment('a').payload, 'x')).toBeNull();
	});

	it('discards an item the member no longer wants', () => {
		expect(states(discard(add(add([], 'a'), 'b'), 'a')!)).toEqual([['b', 'pending']]);
	});
});

describe('recover', () => {
	it('picks up where a closed app left off: nothing stays in flight or held', () => {
		let items = settle(takeBatch(add(add(add([], 'a'), 'b'), 'c'), 'u1', 1).items, []);
		items = takeBatch(items, 'u1', 1).items; // 'a' is in flight again
		items = hold(items, 'b')!;
		items = [...items, { ...items[2], command: moment('d'), state: 'refused', reason: 'nobody' }];
		items = hold(items, 'd')!;

		expect(states(recover(items))).toEqual([
			['a', 'pending'],
			['b', 'pending'],
			['c', 'pending'],
			['d', 'refused']
		]);
	});
});

describe('photos kept with a moment', () => {
	const photo = (id: string) => ({ id, image: new Blob(['i']), thumb: new Blob(['t']), width: 4, height: 3 });
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
		expect(first.upload).toMatchObject({ parentId: 'a', type: 'moment.photo', photo: { id: 'p1' } });
		expect(first.items[0].state).toBe('sending');
		items = settlePhoto(first.items, 'a', 'p1', { id: 'p1', status: 'applied', result: 'ph1' });

		const second = takePhoto(items, 'u1')!;
		expect(second.upload.photo.id).toBe('p2');
		expect(settlePhoto(second.items, 'a', 'p2', { id: 'p2', status: 'applied', result: 'ph2' })).toEqual([]);
	});

	it('sends a kept photo with the capture date it was kept with', () => {
		const dated = { ...photo('p1'), takenAt: '2026-09-27T18:04:00+02:00' };
		const kept = queue([], { command: moment('a'), memberId: 'u1', savedAt: 1, photos: [dated] });
		const delivered = settle(takeBatch(kept, 'u1', 10).items, [{ id: 'a', status: 'applied', result: {} }]);
		expect(takePhoto(delivered, 'u1')?.upload.photo.takenAt).toBe('2026-09-27T18:04:00+02:00');
	});

	it('uploads a photo kept for a gallery into that gallery', () => {
		const gallery = queue([], {
			command: { id: 'g', type: 'gallery.add', payload: { contactId: 'julia', visibility: 'shared' }, issuedAt: 1 },
			memberId: 'u1',
			savedAt: 1,
			photos: [photo('p1')]
		});
		const delivered = settle(takeBatch(gallery, 'u1', 10).items, [{ id: 'g', status: 'applied', result: {} }]);
		expect(takePhoto(delivered, 'u1')?.upload).toMatchObject({ parentId: 'g', type: 'gallery.photo' });
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
		const delivered = settle(takeBatch(upload, 'u1', 10).items, [{ id: 'k', status: 'applied', result: {} }]);
		expect(takePhoto(delivered, 'u1')?.upload).toMatchObject({ parentId: 'k', type: 'circleGallery.photo' });
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
		const busy = settlePhoto(takePhoto(lost, 'u1')!.items, 'a', 'p1', { id: 'p1', status: 'failed' });
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
		expect(refused[0]).toMatchObject({ state: 'refused', reason: 'Unsupported image format.', delivered: true });
		expect(takePhoto(refused, 'u1')).toBeNull();
		expect(hold(refused, 'a')).toBeNull();
		expect(discard(refused, 'a')).toEqual([]);
	});
});

describe('isKept', () => {
	it('tells a kept moment from a kept note, and remembers who a note is about', () => {
		const note: JsonCommand = {
			id: 'n',
			type: 'note.add',
			payload: { contactId: 'julia', body: 'x', visibility: 'shared', isPinned: false },
			issuedAt: 1
		};
		const [m, n] = queue(add([], 'a'), { command: note, memberId: 'u1', savedAt: 1, about: 'Julia' });
		expect(isKept(m, 'moment.capture')).toBe(true);
		expect(isKept(n, 'moment.capture')).toBe(false);
		expect(isKept(n, 'note.add')).toBe(true);
		expect(n.about).toBe('Julia');
		expect(m.about).toBeNull();
	});
});

describe('discardAllOf', () => {
	it('throws away one member’s items when they sign out and ask to, and nobody else’s', () => {
		const items = add(add(add([], 'a'), 'b', 'u2'), 'c');
		expect(states(discardAllOf(items, 'u1'))).toEqual([['b', 'pending']]);
	});

	it('cannot recall what is already on its way', () => {
		const items = takeBatch(add(add([], 'a'), 'b'), 'u1', 1).items;
		expect(states(discardAllOf(items, 'u1'))).toEqual([['a', 'sending']]);
	});
});

describe('what a save someone is watching learns (online saves, concept §8 #10)', () => {
	it('is done once Stella applied it and no photo of it waits', () => {
		expect(deliveryFor({ id: 'a', status: 'applied', result: { noteId: 'n' } }, false)).toEqual({
			status: 'applied',
			result: { noteId: 'n' }
		});
	});

	it('is not settled yet while its photos are still on their way', () => {
		expect(deliveryFor({ id: 'a', status: 'applied', result: {} }, true)).toBeNull();
	});

	it('is refused with Stella’s reason, for the form to show', () => {
		expect(deliveryFor({ id: 'a', status: 'refused', reason: 'Already linked.' }, false)).toEqual({
			status: 'refused',
			reason: 'Already linked.'
		});
	});

	it('carries the people a refused batch names, for the form to mark', () => {
		const refusals = [{ targetId: 'otto', reason: 'That relationship already exists.' }];
		expect(deliveryFor({ id: 'a', status: 'refused', reason: 'Otto Meier: …', refusals }, false)).toEqual({
			status: 'refused',
			reason: 'Otto Meier: …',
			refusals
		});
	});

	it('learns nothing from a “not now”', () => {
		expect(deliveryFor({ id: 'a', status: 'busy' }, false)).toBeNull();
		expect(deliveryFor({ id: 'a', status: 'failed' }, false)).toBeNull();
	});

	it('is kept for later when a round ends without an answer for it', () => {
		expect(deliveryLeftOver(null)).toEqual({ status: 'kept' });
	});

	it('is done when Stella took it and only its photos are left to send later', () => {
		expect(deliveryLeftOver({ result: { entryId: 'e' } })).toEqual({ status: 'applied', result: { entryId: 'e' } });
	});
});

describe('photoAnswer', () => {
	const TOO_LARGE = 'Too large for this server';
	const applied: CommandAnswer = { id: 'p1', status: 'applied', result: null };

	it('takes Stella’s own answer when the upload got through', () => {
		expect(photoAnswer('p1', 200, applied, TOO_LARGE)).toEqual(applied);
	});

	it('refuses a photo the server turned away as too large, rather than retrying it for ever', () => {
		expect(photoAnswer('p1', 413, null, TOO_LARGE)).toEqual({ id: 'p1', status: 'refused', reason: TOO_LARGE });
	});

	it('leaves any other failure waiting, since it may pass on the next try', () => {
		expect(photoAnswer('p1', 502, null, TOO_LARGE)).toBeNull();
		expect(photoAnswer('p1', 500, null, TOO_LARGE)).toBeNull();
	});
});
