import { describe, expect, test } from 'bun:test';
import type { LinkedPhrase } from '$lib/i18n/linked';
import { createTranslator } from '$lib/i18n/translate';
import { lastNameChips } from './read-person-page';

const t = createTranslator('en');
const because =
	(text: string): LinkedPhrase =>
	() => ({ people: {}, say: () => text });

describe('lastNameChips', () => {
	test('one proposal is one chip, its reasons joined', () => {
		const chips = lastNameChips(
			{
				kind: 'one',
				name: 'Meier',
				confidence: 'certain',
				alternatives: ['Muster'],
				reasons: [because('as her father'), because('as her brother')]
			},
			t
		);
		expect(chips).toEqual([{ name: 'Meier', why: 'as her father · as her brother' }]);
	});

	test('equally sure names are a chip each', () => {
		const chips = lastNameChips(
			{
				kind: 'choose',
				options: [
					{ name: 'Meier', confidence: 'likely', reasons: [because('as her father')] },
					{ name: 'Muster', confidence: 'likely', reasons: [because('as her mother')] }
				]
			},
			t
		);
		expect(chips.map((chip) => chip.name)).toEqual(['Meier', 'Muster']);
	});

	test('no proposal, no chips', () => {
		expect(lastNameChips({ kind: 'none' }, t)).toEqual([]);
	});
});
