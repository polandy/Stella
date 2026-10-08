import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { captionWords } from './caption-words';

/*
 * The shelf's captions in the viewer's language (docs/05 §5.8): "Friend of Sandra",
 * "Freundin von Sandra", "Lena, Noah +2".
 */

const en = createTranslator('en');
const de = createTranslator('de');
const names: Record<string, string> = {
	sandra: 'Sandra',
	lena: 'Lena',
	noah: 'Noah',
	hans: 'Hans'
};
const nameOf = (id: string) => names[id];

describe('captionWords', () => {
	it('says what somebody is to the person they hang off, gendered, in both languages', () => {
		const friend = {
			kind: 'tie' as const,
			role: { term: 'friend' as const, variant: 'female' as const },
			anchor: 'sandra',
			more: 0
		};

		expect(captionWords(en, friend, nameOf)).toBe('Friend of Sandra');
		expect(captionWords(de, friend, nameOf)).toBe('Freundin von Sandra');
	});

	it('counts the others they hang off as well', () => {
		const neighbour = {
			kind: 'tie' as const,
			role: { term: 'neighbor' as const, variant: 'male' as const },
			anchor: 'hans',
			more: 2
		};

		expect(captionWords(en, neighbour, nameOf)).toMatch(/^Neighbou?r of Hans \+2$/);
		expect(captionWords(de, neighbour, nameOf)).toBe('Nachbar von Hans +2');
	});

	it('takes a household’s own type by its words', () => {
		const godparent = {
			kind: 'tie' as const,
			role: { label: 'Godparent of' },
			anchor: 'hans',
			more: 0
		};

		expect(captionWords(en, godparent, nameOf)).toBe('Godparent of Hans');
	});

	it('names a circle’s people on the map, two and then the rest as a count', () => {
		expect(captionWords(en, { kind: 'members', ids: ['lena'], more: 0 }, nameOf)).toBe('Lena');
		expect(captionWords(de, { kind: 'members', ids: ['lena', 'noah'], more: 0 }, nameOf)).toBe(
			'Lena, Noah'
		);
		expect(captionWords(en, { kind: 'members', ids: ['lena', 'noah'], more: 2 }, nameOf)).toBe(
			'Lena, Noah +2'
		);
	});
});
