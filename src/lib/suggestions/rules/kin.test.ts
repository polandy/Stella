import { describe, expect, it } from 'bun:test';
import { textOf } from '$lib/i18n/linked';
import { createTranslator } from '$lib/i18n/translate';
import type { KinshipGraph } from '$lib/kinship/kinship';
import type { LinkSuggestion } from '../types';
import { buildView } from '../view';
import { K1 } from './kin';

/*
 * K1 — a worked-out relative, offered for entering (docs/02 §2.4.1,
 * docs/concepts/relationship-suggestions.md §3.5). The review asks about what Stella works
 * out as well as about what follows, so the household can enter it from the same list.
 */

const en = createTranslator('en');

/** Otto → Rita → Nils, with Rita's partner Vera, who is Nils's step-parent only. */
const family: KinshipGraph = {
	people: [
		{ id: 'otto', displayName: 'Otto' },
		{ id: 'rita', displayName: 'Rita' },
		{ id: 'nils', displayName: 'Nils' },
		{ id: 'vera', displayName: 'Vera' }
	],
	parentEdges: [
		{ parentId: 'otto', childId: 'rita' },
		{ parentId: 'rita', childId: 'nils' }
	],
	siblingEdges: [],
	partnerEdges: [{ a: 'rita', b: 'vera' }],
	storedPairs: []
};

const claims = (found: LinkSuggestion[]) =>
	found.map(({ relation, fromId, toId }) => ({ relation, fromId, toId }));

describe('K1', () => {
	it("offers a person's worked-out relatives, the elder generation first", () => {
		expect(claims(K1({ kind: 'person-reviewed', subjectId: 'nils' }, buildView(family)))).toEqual(
			[{ relation: 'grandparent', fromId: 'otto', toId: 'nils' }]
		);
	});

	it('offers the same claim from the other end, beside the in-law the partnership makes', () => {
		expect(claims(K1({ kind: 'person-reviewed', subjectId: 'otto' }, buildView(family)))).toEqual(
			[
				{ relation: 'grandparent', fromId: 'otto', toId: 'nils' },
				{ relation: 'parent-in-law', fromId: 'otto', toId: 'vera' }
			]
		);
	});

	it('leaves the step terms out — they are corrected on the profile, not entered as they are', () => {
		// Vera is Nils's step-parent: nothing to enter. Her in-law tie to Otto, from the same
		// partnership, is the positive control that the review did reach her.
		const offered = claims(K1({ kind: 'person-reviewed', subjectId: 'vera' }, buildView(family)));
		expect(offered).toEqual([{ relation: 'parent-in-law', fromId: 'otto', toId: 'vera' }]);
	});

	it('reaches everyone the viewer can see on a household pass', () => {
		expect(claims(K1({ kind: 'household-reviewed' }, buildView(family)))).toContainEqual({
			relation: 'grandparent',
			fromId: 'otto',
			toId: 'nils'
		});
	});

	it('answers no write: a worked-out relative is asked about on a review only', () => {
		const stored = { kind: 'link-stored', link: { kind: 'parent', fromId: 'rita', toId: 'nils' } } as const;
		expect(K1(stored, buildView(family))).toEqual([]);
	});

	it('says whom the relative is worked out through, each name a way to that person', () => {
		const [grandparent] = K1({ kind: 'person-reviewed', subjectId: 'nils' }, buildView(family));
		const sentence = grandparent!.reason(en);
		expect(textOf(sentence)).toBe('Worked out through Rita, not entered yet');
		expect(Object.values(sentence.people)).toEqual([{ id: 'rita', name: 'Rita' }]);
		expect(grandparent!.confidence).toBe('certain');
	});
});
