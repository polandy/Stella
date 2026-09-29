import { describe, expect, it } from 'bun:test';
import { segmentsOf, textOf } from '$lib/i18n/linked';
import { createTranslator } from '$lib/i18n/translate';
import { claimSentence } from './claim-sentence';

/*
 * The claim a row makes, said so that both people in it stay followable (docs/02 §2.4.1).
 *
 * The same sentence the row has always shown — it is the names inside it that change, from
 * text into a way to that person's page. Which is why it is built here and not written into
 * the component: a sentence with slots is a thing to test, an interpolated string is not.
 */

const en = createTranslator('en');
const de = createTranslator('de');
const otto = { id: 'p-otto', name: 'Otto Meier' };
const lisa = { id: 'p-lisa', name: 'Lisa Meier' };

const idsIn = (claim: ReturnType<typeof claimSentence>, t: typeof en) =>
	segmentsOf(claim(t)).flatMap((segment) => ('person' in segment ? [segment.person.id] : []));

describe('claimSentence', () => {
	it('names the elder of a worked-out claim by their gender, both names followable', () => {
		const claim = claimSentence('aunt-uncle', otto, lisa, 'male');
		expect(textOf(claim(en))).toBe('Otto Meier is an uncle of Lisa Meier');
		expect(textOf(claim(de))).toBe('Otto Meier ist ein Onkel von Lisa Meier');
		expect(idsIn(claim, en)).toEqual(['p-otto', 'p-lisa']);
		expect(textOf(claimSentence('grandparent', otto, lisa, 'female')(de))).toBe(
			'Otto Meier ist eine Großmutter von Lisa Meier'
		);
	});

	it('names the relative of a symmetric claim, from the person it was asked about', () => {
		// `from` is the reviewed end, `to` the relative: the sentence is about the relative.
		const claim = claimSentence('cousin', otto, lisa, 'female');
		expect(textOf(claim(de))).toBe('Lisa Meier ist eine Cousine von Otto Meier');
		expect(textOf(claimSentence('sibling-in-law', otto, lisa, 'male')(en))).toBe(
			'Lisa Meier is a brother-in-law of Otto Meier'
		);
	});

	it('stays neutral where no gender is on record', () => {
		expect(textOf(claimSentence('aunt-uncle', otto, lisa)(de))).toBe(
			'Otto Meier ist Tante oder Onkel von Lisa Meier'
		);
		expect(textOf(claimSentence('cousin', otto, lisa, 'neutral')(en))).toBe(
			'Lisa Meier is a cousin of Otto Meier'
		);
	});

	it('says a parent claim the way each language says it', () => {
		const claim = claimSentence('parent', otto, lisa);
		expect(textOf(claim(en))).toBe('Otto Meier is a parent of Lisa Meier');
		expect(textOf(claim(de))).toBe('Otto Meier ist ein Elternteil von Lisa Meier');
	});

	it('says a sibling claim the way each language says it', () => {
		const claim = claimSentence('sibling', otto, lisa);
		expect(textOf(claim(en))).toBe('Otto Meier and Lisa Meier are siblings');
		expect(textOf(claim(de))).toBe('Otto Meier und Lisa Meier sind Geschwister');
	});

	it('leaves both people followable, whichever claim and whichever language', () => {
		for (const relation of ['parent', 'sibling'] as const) {
			for (const t of [en, de]) {
				expect(idsIn(claimSentence(relation, otto, lisa), t)).toEqual(['p-otto', 'p-lisa']);
			}
		}
	});
});
