import { describe, expect, it } from 'bun:test';
import { deliveryFor, deliveryLeftOver } from './outbox-delivery';

describe('what a save someone is watching learns (online saves, docs/04 ADR-076)', () => {
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
		expect(
			deliveryFor({ id: 'a', status: 'refused', reason: 'Otto Meier: …', refusals }, false)
		).toEqual({
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
		expect(deliveryLeftOver({ result: { entryId: 'e' } })).toEqual({
			status: 'applied',
			result: { entryId: 'e' }
		});
	});
});
