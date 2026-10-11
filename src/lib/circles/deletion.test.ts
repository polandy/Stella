import { describe, expect, it } from 'bun:test';
import { INTL_LOCALES } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import { circleDeletionSentences, type CircleDeletionCounts } from './deletion';

/*
 * What a circle's confirm step says goes and what stays (docs/02 §2.4.2): the members and
 * photos, the profile pictures that become their wearer's own, and the nested circles that stay
 * without a parent — named when the reader sees them, else only counted.
 */

const en = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
const de = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };

const preview = (over: Partial<CircleDeletionCounts> = {}): CircleDeletionCounts => ({
	name: 'Class 1B',
	members: 24,
	photos: 7,
	wornPhotos: 0,
	wearers: 0,
	children: { named: [], unnamed: 0 },
	...over
});

describe('circleDeletionSentences', () => {
	it('says how many members leave and how many photos go', () => {
		expect(circleDeletionSentences(en, preview())).toEqual([
			'This deletes Class 1B: 24 members leave it and its 7 photos are deleted. It cannot be undone.'
		]);
		expect(circleDeletionSentences(de, preview())).toEqual([
			'Damit wird Class 1B gelöscht: 24 Mitglieder verlassen ihn und seine 7 Fotos werden gelöscht. Das lässt sich nicht rückgängig machen.'
		]);
	});

	it('leaves out what the circle does not have', () => {
		expect(circleDeletionSentences(en, preview({ members: 1, photos: 0 }))).toEqual([
			'This deletes Class 1B: 1 member leaves it. It cannot be undone.'
		]);
		expect(circleDeletionSentences(en, preview({ members: 0, photos: 1 }))).toEqual([
			'This deletes Class 1B: its photo is deleted. It cannot be undone.'
		]);
		expect(circleDeletionSentences(en, preview({ members: 0, photos: 0 }))).toEqual([
			'This deletes Class 1B. It cannot be undone.'
		]);
	});

	it('says whose profile picture is cut from its photos, and that they keep it', () => {
		expect(circleDeletionSentences(en, preview({ wornPhotos: 2, wearers: 5 }))[1]).toBe(
			'2 of its photos are the profile picture of 5 people. They keep it as a photo of their own.'
		);
		expect(circleDeletionSentences(de, preview({ wornPhotos: 1, wearers: 1 }))[1]).toBe(
			'1 seiner Fotos ist das Profilbild von 1 Person. Sie behalten es als eigenes Foto.'
		);
	});

	it('names the nested circles the reader sees, and counts the rest', () => {
		const named = [
			{ id: 'k2', name: 'Class 1B Choir' },
			{ id: 'k3', name: 'Class 1B Reading group' }
		];
		expect(circleDeletionSentences(en, preview({ children: { named, unnamed: 0 } }))[1]).toBe(
			'Class 1B Choir and Class 1B Reading group stay, without a parent circle.'
		);
		expect(
			circleDeletionSentences(
				en,
				preview({ children: { named: named.slice(0, 1), unnamed: 2 } })
			)[1]
		).toBe('Class 1B Choir and 2 more circles stay, without a parent circle.');
		expect(circleDeletionSentences(de, preview({ children: { named: [], unnamed: 1 } }))[1]).toBe(
			'1 Kreis darin bleibt, ohne übergeordneten Kreis.'
		);
	});
});
