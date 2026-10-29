import { describe, expect, it } from 'bun:test';
import type { MomentCapturePayload } from '$lib/commands/commands';
import type { MentionCandidate } from '$lib/mentions/mentions';
import { handleFor } from '$lib/mentions/picker';
import { composerReading } from './composer-reading';
import type { ComposerState } from './composer-state';

/*
 * Why Save is off, and the line that says so beside it (docs/02 §2.22.1). A moment needs words,
 * a person — the page's own or an @mention — and no namesake left open; a photo alone is not one.
 * The field itself is `composer-state.test.ts`'s.
 */

const anna: MentionCandidate = { id: 'anna', displayName: 'Anna Muster' };
const thomasWork: MentionCandidate = { id: 't1', displayName: 'Thomas' };
const thomasNext: MentionCandidate = { id: 't2', displayName: 'Thomas' };
const known = [anna, thomasWork, thomasNext];

type Reading = Pick<
	ComposerState,
	'body' | 'picks' | 'anchorId' | 'sending' | 'photos' | 'immichPhotos'
>;

const onItsWay: MomentCapturePayload = {
	body: 'tea',
	entryDate: '2026-10-29',
	visibility: 'shared',
	newPeople: []
};
const photo = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
const empty: Reading = {
	body: '',
	picks: [],
	anchorId: null,
	sending: null,
	photos: [],
	immichPhotos: []
};

const read = (more: Partial<Reading>) => composerReading({ ...empty, ...more }, known, new Map());

describe('why Save is off', () => {
	it('is on with words and a person, from the page or an @mention', () => {
		for (const state of [
			{ body: 'tea', anchorId: 'anna' },
			{ body: `tea with ${handleFor(anna)}` }
		]) {
			expect(read(state)).toMatchObject({ blocked: null, canSave: true, saveHint: null });
		}
	});

	it('wants words first, even with a photo and the page’s person', () => {
		expect(read({ photos: [photo], anchorId: 'anna' }).blocked).toBe('noText');
		expect(read({ body: '   ', immichPhotos: [photo] }).blocked).toBe('noText');
	});

	it('wants a person once there are words', () => {
		expect(read({ body: 'Nice day', photos: [photo] })).toMatchObject({
			blocked: 'noPerson',
			canSave: false
		});
	});

	it('leaves an open namesake to the box asking which one, not to a missing person', () => {
		expect(read({ body: '@Thomas came' }).blocked).toBe('unclear');
	});

	it('is off while the moment is on its way', () => {
		expect(read({ body: 'tea', anchorId: 'anna', sending: onItsWay }).blocked).toBe('sending');
	});
});

describe('the line beside Save', () => {
	it('stays quiet until something is typed or a photo added', () => {
		expect(read({}).saveHint).toBeNull();
		expect(read({ anchorId: 'anna' }).saveHint).toBeNull();
	});

	it('asks for the words when only photos are there', () => {
		expect(read({ photos: [photo] }).saveHint).toBe('writeWhatHappened');
	});

	it('asks for an @mention when the words name nobody', () => {
		expect(read({ body: 'Nice day' }).saveHint).toBe('mentionSomeone');
		expect(read({ body: 'Nice day', immichPhotos: [photo] }).saveHint).toBe('mentionSomeone');
	});

	it('says nothing for a namesake or a moment on its way, which have their own words', () => {
		expect(read({ body: '@Thomas came' }).saveHint).toBeNull();
		expect(read({ body: 'tea', anchorId: 'anna', sending: onItsWay }).saveHint).toBeNull();
	});
});
