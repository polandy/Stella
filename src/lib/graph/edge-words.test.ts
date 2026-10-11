import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { edgeWords, treeRoleWords } from './edge-words';

/*
 * How a line and a role under a name read in the viewer's language (docs/02 §2.7, §2.19): a
 * built-in type translated, a household's own as typed, a worked-out term by its kinship word —
 * and a link marked former says so, since on the canvas its name is all a reader hears.
 */

const en = createTranslator('en');
const de = createTranslator('de');

describe('edgeWords', () => {
	it('translates a built-in type and keeps a household’s own as typed', () => {
		const spouse = {
			id: 'r',
			source: 'a',
			target: 'b',
			kind: 'relationship' as const,
			typeKey: 'spouse',
			label: 'Spouse of'
		};
		expect(edgeWords(en, spouse)).toBe('Spouse of');
		expect(edgeWords(de, spouse)).not.toBe('Spouse of');
		const own = { ...spouse, typeKey: 'godparent-custom', label: 'Pate von' };
		expect(edgeWords(en, own)).toBe('Pate von');
	});

	it('says a former link is former, in both languages', () => {
		const ex = {
			id: 'r',
			source: 'a',
			target: 'b',
			kind: 'relationship' as const,
			typeKey: 'spouse',
			label: 'Spouse of',
			former: true as const
		};
		expect(edgeWords(en, ex)).toBe('Spouse of · former');
		expect(edgeWords(de, ex)).toBe(`${edgeWords(de, { ...ex, former: undefined })} · ehemalig`);
	});

	it('names a worked-out line by its kinship word', () => {
		const kin = {
			id: 'k',
			source: 'a',
			target: 'b',
			kind: 'kinship' as const,
			kin: { term: 'grandparent' as const, variant: 'male' as const },
			derived: true
		};
		expect(edgeWords(en, kin)).toBe('Grandfather');
	});
});

describe('treeRoleWords', () => {
	it('says the role, and that it is former when the tie has ended', () => {
		expect(treeRoleWords(en, { term: 'spouse', variant: 'female' })).toBe('Wife');
		expect(treeRoleWords(en, { term: 'spouse', variant: 'female', former: true })).toBe(
			'Wife · former'
		);
		expect(treeRoleWords(de, { term: 'spouse', variant: 'female', former: true })).toBe(
			'Ehefrau · ehemalig'
		);
	});
});
