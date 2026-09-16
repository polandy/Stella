import { describe, expect, it } from 'bun:test';
import { groupBySubject } from './grouping';
import type { Relation } from './types';

/*
 * Grouping a household-wide list by the person each claim is about
 * (docs/concepts/relationship-suggestions.md §6.6).
 *
 * The household pass answers about everyone at once, so the list only reads as help if the
 * claims about one person arrive together. Which person that is, is a property of the claim
 * rather than of the screen — hence a pure function with its own suite.
 */

const claim = (relation: Relation, fromId: string, toId: string, fromName: string, toName: string) => ({
	relation,
	fromId,
	toId,
	fromName,
	toName
});

describe('groupBySubject', () => {
	/*
	 * A parent claim is about the child: "Bettina is a parent of Lisa" answers a question
	 * about Lisa's parents, and the household reads it on Lisa's row.
	 */
	it('files a parent claim under the child', () => {
		expect(
			groupBySubject([claim('parent', 'bettina', 'lisa', 'Bettina Meier', 'Lisa Meier')])
		).toEqual([
			{
				subjectId: 'lisa',
				subjectName: 'Lisa Meier',
				suggestions: [claim('parent', 'bettina', 'lisa', 'Bettina Meier', 'Lisa Meier')]
			}
		]);
	});

	/* A sibling claim names two people symmetrically; the first end is the one it is filed under. */
	it('files a sibling claim under the end the rule named first', () => {
		expect(groupBySubject([claim('sibling', 'jan', 'nora', 'Jan Frei', 'Nora Frei')])).toEqual([
			{
				subjectId: 'jan',
				subjectName: 'Jan Frei',
				suggestions: [claim('sibling', 'jan', 'nora', 'Jan Frei', 'Nora Frei')]
			}
		]);
	});

	it('keeps every claim about one person together, in the order they arrived', () => {
		const grouped = groupBySubject([
			claim('parent', 'bettina', 'lisa', 'Bettina Meier', 'Lisa Meier'),
			claim('parent', 'peter', 'mira', 'Peter Vogt', 'Mira Vogt'),
			claim('parent', 'otto', 'lisa', 'Otto Meier', 'Lisa Meier')
		]);
		expect(grouped.map((group) => [group.subjectId, group.suggestions.length])).toEqual([
			['lisa', 2],
			['mira', 1]
		]);
		expect(grouped[0]?.suggestions.map((s) => s.fromId)).toEqual(['bettina', 'otto']);
	});

	it('has nothing to group when nothing was found', () => {
		expect(groupBySubject([])).toEqual([]);
	});
});
