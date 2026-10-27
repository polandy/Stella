import { describe, expect, it } from 'bun:test';
import type { IncomingCard, StellaPerson } from '../../../import-match/card';
import { changedOnCard, photoPrint, syncConflicts } from './sync-plan';

const card = (over: Partial<IncomingCard> = {}): IncomingCard => ({
	key: 'u1',
	hash: 'h',
	firstName: 'Anna',
	lastName: 'Muster',
	displayName: 'Anna Muster',
	nickname: null,
	company: null,
	jobTitle: null,
	birthday: { value: '1950-04-07', precision: 'full' },
	emails: [{ value: 'anna@example.com', label: null }],
	phones: [{ value: '+41 79 111 22 33', label: { known: 'mobile' } }],
	addresses: [],
	urls: [],
	tags: [],
	photo: null,
	...over
});

const person = (over: Partial<StellaPerson> = {}): StellaPerson => ({
	id: 'p1',
	firstName: 'Anna',
	lastName: 'Muster',
	displayName: 'Anna Muster',
	nickname: null,
	company: null,
	jobTitle: null,
	birthday: { value: '1950-04-07', precision: 'full' },
	hasPhoto: false,
	fields: [
		{ kind: 'email', value: 'anna@example.com' },
		{ kind: 'phone', value: '+41 79 111 22 33' }
	],
	homeLines: [],
	tags: [],
	...over
});

const noPhotos = { card: null, base: null, stella: null };

describe('what changed on a linked card', () => {
	it('is only what is new against the card Stella last saw', () => {
		const base = card();
		const now = card({
			emails: [...base.emails, { value: 'neu@example.com', label: { known: 'work' } }],
			nickname: 'Grosi',
			company: 'Bäckerei',
			urls: [{ value: 'https://anna.example', label: null }],
			tags: ['Chor']
		});
		const changed = changedOnCard(base, now, noPhotos);

		expect(changed.emails).toEqual([{ value: 'neu@example.com', label: { known: 'work' } }]);
		expect(changed.phones).toEqual([]);
		// Neither unchanged names nor anything Stella does not keep in step come in.
		expect([changed.firstName, changed.lastName, changed.birthday]).toEqual([null, null, null]);
		expect([changed.nickname, changed.company, changed.urls, changed.tags]).toEqual([
			null,
			null,
			[],
			[]
		]);
	});

	it('does not bring back what Stella dropped while the card kept it', () => {
		// Stella removed the number; the card still has it, as it had before.
		const changed = changedOnCard(card(), card(), noPhotos);
		expect(changed.phones).toEqual([]);
	});

	it('is the whole card when Stella has not seen it before', () => {
		const changed = changedOnCard(null, card({ photo: 'inline' }), { ...noPhotos, card: 'c' });
		expect(changed.firstName).toBe('Anna');
		expect(changed.phones).toHaveLength(1);
		expect(changed.photo).toBe('inline');
	});

	it('counts a picture only when it is a different one', () => {
		const prints = { card: 'c1', base: 'c1', stella: null };
		expect(changedOnCard(card({ photo: 'inline' }), card({ photo: 'inline' }), prints).photo).toBe(
			null
		);
		expect(changedOnCard(card(), card({ photo: 'inline' }), { ...prints, base: null }).photo).toBe(
			'inline'
		);
	});
});

describe('a sync conflict', () => {
	it('is a name or birthday the card changed to something Stella holds otherwise', () => {
		const base = card();
		const changed = changedOnCard(
			base,
			card({ lastName: 'Meier', birthday: { value: '1950-04-08', precision: 'full' } }),
			noPhotos
		);
		expect(syncConflicts(changed, person(), noPhotos)).toEqual([
			{ kind: 'lastName', stella: 'Muster', card: 'Meier' },
			{
				kind: 'birthday',
				stella: { value: '1950-04-07', precision: 'full' },
				card: { value: '1950-04-08', precision: 'full' }
			}
		]);
	});

	it('is not one when only Stella changed it', () => {
		const changed = changedOnCard(card(), card({ emails: [] }), noPhotos);
		expect(syncConflicts(changed, person({ lastName: 'Meier' }), noPhotos)).toEqual([]);
	});

	it('is a new picture on the card while Stella has another', () => {
		const prints = { card: 'c2', base: 'c1', stella: 's1' };
		const changed = changedOnCard(card({ photo: 'inline' }), card({ photo: 'inline' }), prints);
		expect(syncConflicts(changed, person({ hasPhoto: true }), prints)).toEqual([{ kind: 'photo' }]);
		expect(syncConflicts(changed, person({ hasPhoto: true }), { ...prints, stella: 'c2' })).toEqual(
			[]
		);
		expect(syncConflicts(changed, person(), prints)).toEqual([]);
	});
});

describe('a picture’s print', () => {
	it('is the same however the card wraps its base64', () => {
		expect(photoPrint('AAAA\r\n BBBB')).toBe(photoPrint('AAAABBBB'));
		expect(photoPrint('AAAA')).not.toBe(photoPrint('AAAB'));
	});
});
