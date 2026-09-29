import { describe, expect, it } from 'bun:test';
import { createTranslator } from '../../../i18n/translate';
import type { ContactSummary } from '../contacts/contacts';
import { AmbiguousMentionError, resolveForAudience } from './resolve-for-audience';

/*
 * Resolving what a text names against who its audience may name (docs/02 §2.20.1), and asking
 * rather than guessing when a typed handle is two people (§2.2.3). A picked mention arrives as
 * an id token and never reaches this question; a hand-typed `@Thomas` does.
 */

const person = (over: Partial<ContactSummary> & { id: string; displayName: string }): ContactSummary => ({
	firstName: null,
	lastName: null,
	nickname: null,
	description: null,
	metPlace: null,
	metDate: null,
	visibility: 'shared',
	avatarPhotoId: null,
	birthDate: null,
	...over
});

const household = [
	person({ id: 'thomas-hut', displayName: 'Thomas', firstName: 'Thomas', description: 'Mountain guide at the hut' }),
	person({ id: 'thomas-lenk', displayName: 'Thomas', firstName: 'Thomas', metPlace: 'Lenk', metDate: '2023-08-12' }),
	person({ id: 'sandra', displayName: 'Sandra Brunner', firstName: 'Sandra', lastName: 'Brunner' })
];

describe('resolveForAudience', () => {
	it('turns every handle that is exactly one person into their token', () => {
		expect(resolveForAudience(household, 'shared', 'with @SandraBrunner and @{contact:thomas-hut}')).toEqual({
			body: 'with @{contact:sandra} and @{contact:thomas-hut}',
			ids: ['sandra', 'thomas-hut']
		});
	});

	it('names by token only people the audience may name, so a token for anyone else links nobody', () => {
		const withPrivate = [...household, person({ id: 'secret', displayName: 'Sam', visibility: 'private' })];
		// Gone since it was written (a moment kept on a phone), or hidden from this audience.
		expect(resolveForAudience(withPrivate, 'shared', '@{contact:gone} @{contact:secret} @{contact:sandra}').ids).toEqual([
			'sandra'
		]);
		expect(resolveForAudience(withPrivate, 'private', '@{contact:secret}').ids).toEqual(['secret']);
	});

	it('refuses a handle two people answer to, naming each with what tells them apart', () => {
		let refusal: unknown;
		try {
			resolveForAudience(household, 'shared', 'hiked with @Thomas and @SandraBrunner');
		} catch (err) {
			refusal = err;
		}
		expect(refusal).toBeInstanceOf(AmbiguousMentionError);
		const phrase = (refusal as AmbiguousMentionError).phrase;
		expect(phrase(createTranslator('en'))).toBe(
			'@Thomas could be 2 people: Thomas (Mountain guide at the hut), Thomas (Met: Lenk · 2023). Pick the one you mean from the list that opens when you type @.'
		);
		expect(phrase(createTranslator('de'))).toContain('@Thomas passt auf 2 Personen: Thomas (Mountain guide at the hut), Thomas (Kennengelernt: Lenk · 2023)');
	});

	it('counts only the people the audience may name, so a private namesake makes a shared text no less clear', () => {
		const withPrivateThomas = [household[0], { ...household[1], visibility: 'private' as const }];
		expect(resolveForAudience(withPrivateThomas, 'shared', 'with @Thomas').ids).toEqual(['thomas-hut']);
		expect(() => resolveForAudience(withPrivateThomas, 'private', 'with @Thomas')).toThrow(AmbiguousMentionError);
	});
});
