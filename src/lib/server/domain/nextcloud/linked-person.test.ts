import { describe, expect, it } from 'bun:test';
import type { KnownLabel } from '../../../import-match/card';
import { asStellaPerson, cardAvatar, onCard } from './linked-person';
import type { LinkedPerson } from './store';

/*
 * A linked person both ways a sync reads them (docs/02 §2.16.3): as the person a card is merged
 * against, and as what their card holds — labels in the words address books share, the home
 * they live in as their home address, and a picture only in a format a phone shows.
 */

const anna = (over: Partial<LinkedPerson> = {}): LinkedPerson => ({
	id: 'c-anna',
	firstName: 'Anna',
	lastName: 'Muster',
	displayName: 'Anna Muster',
	nickname: 'Anni',
	company: 'Acme',
	jobTitle: 'Engineer',
	birthday: { value: '1990-04-07', precision: 'full' },
	fields: [
		{ kind: 'phone', value: '+41 79', label: 'Mobil' },
		{ kind: 'email', value: 'anna@example.org', label: 'Büro' },
		{ kind: 'phone', value: '+41 44', label: '  ' },
		{ kind: 'address', value: 'Old Street 1, Bern', label: null },
		{ kind: 'url', value: 'https://anna.example.org', label: null }
	],
	homeLines: ['Main St 1, 3000 Bern'],
	tags: ['Family'],
	hasPhoto: true,
	avatar: { photoId: 'ph-1', path: 'ph-1.jpg', mime: 'image/jpeg' },
	...over
});

/** The German words a member types for the labels every address book knows. */
const GERMAN_LABELS: Record<string, KnownLabel> = {
	Mobil: 'mobile',
	Büro: 'work',
	Zuhause: 'home'
};
const knownLabel = (text: string): KnownLabel | null => GERMAN_LABELS[text] ?? null;

describe('asStellaPerson', () => {
	it('keeps the person’s facts and their fields without labels', () => {
		const person = asStellaPerson(anna());

		expect(person).toMatchObject({
			id: 'c-anna',
			nickname: 'Anni',
			company: 'Acme',
			hasPhoto: true
		});
		expect(person.fields[0]).toEqual({ kind: 'phone', value: '+41 79' });
		expect(person).not.toHaveProperty('avatar');
	});
});

describe('onCard', () => {
	it('labels each field in the shared words where it can, and as typed where it cannot', () => {
		const card = onCard(anna(), knownLabel);

		expect(card.phones).toEqual([
			{ value: '+41 79', label: { known: 'mobile' } },
			{ value: '+41 44', label: null }
		]);
		expect(card.emails).toEqual([{ value: 'anna@example.org', label: { known: 'work' } }]);
		expect(onCard(anna(), () => null).emails).toEqual([
			{ value: 'anna@example.org', label: { typed: 'Büro' } }
		]);
	});

	it('sends the home they live in as their home address, after the addresses of their own', () => {
		expect(onCard(anna(), knownLabel).addresses).toEqual([
			{ value: 'Old Street 1, Bern', label: null },
			{ value: 'Main St 1, 3000 Bern', label: { known: 'home' } }
		]);
	});

	it('carries the avatar’s photo id when a phone can show it', () => {
		expect(onCard(anna(), knownLabel).photoId).toBe('ph-1');
	});
});

describe('cardAvatar', () => {
	it('keeps a JPEG or a PNG and leaves any other picture off the card', () => {
		const png = { photoId: 'ph-2', path: 'ph-2.png', mime: 'image/png' };
		expect(cardAvatar(anna({ avatar: png }))).toEqual(png);
		expect(
			cardAvatar(anna({ avatar: { photoId: 'ph-3', path: 'ph-3.heic', mime: 'image/heic' } }))
		).toBeNull();
		expect(cardAvatar(anna({ avatar: null }))).toBeNull();
	});
});
