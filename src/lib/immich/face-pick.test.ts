import { describe, expect, it } from 'bun:test';
import { faceChoice } from './face-pick';

/*
 * What a tap on a face in *Find in Immich* does (docs/02 §2.24.2): a free face links, a face held
 * by someone the member sees opens that person's photos, and one held out of the member's reach
 * does nothing at all.
 */

describe('faceChoice', () => {
	it('links a face nobody holds', () => {
		expect(faceChoice(null, 'c-anna')).toEqual({ kind: 'link' });
	});

	it('browses the photos of a face held by someone the member sees', () => {
		expect(faceChoice({ contactId: 'c-bert', name: 'Bert Example' }, 'c-anna')).toEqual({
			kind: 'browse',
			contactId: 'c-bert',
			name: 'Bert Example'
		});
	});

	it('offers nothing for a face held by someone out of the member’s reach', () => {
		expect(faceChoice({ contactId: null, name: null }, 'c-anna')).toEqual({
			kind: 'taken',
			name: null
		});
	});

	it('offers nothing for the face the person the picker is for already holds', () => {
		expect(faceChoice({ contactId: 'c-anna', name: 'Anna Example' }, 'c-anna')).toEqual({
			kind: 'taken',
			name: 'Anna Example'
		});
	});
});
