import { describe, expect, it } from 'bun:test';
import type { SurnameProposal } from './rules/surnames';
import { groupBySurname, householdSpellings } from './surname-groups';

/*
 * The *Last names* list (docs/02 §2.2.4.2): everyone without one, grouped by the
 * name proposed — the largest group first — then those who must choose, then the rest.
 */

const one = (
	name: string,
	confidence: 'certain' | 'likely' | 'possible' = 'likely'
): SurnameProposal => ({
	kind: 'one',
	name,
	confidence,
	reasons: [],
	alternatives: []
});

describe('householdSpellings', () => {
	it('shows each name in the spelling the household uses most', () => {
		const spellings = householdSpellings(['Müller', 'Muller', 'Müller', null, 'Brunner']);
		expect(spellings.get('muller')).toBe('Müller');
		expect(spellings.get('brunner')).toBe('Brunner');
	});
});

describe('groupBySurname', () => {
	it('groups by the folded name, largest group first, in the household’s spelling', () => {
		const list = groupBySurname(
			[
				{ personId: 'jo', proposal: one('Keller') },
				{ personId: 'lea', proposal: one('brunner') },
				{ personId: 'max', proposal: one('Brunner') }
			],
			householdSpellings(['Brunner'])
		);
		expect(list.groups.map((g) => ({ name: g.name, ids: g.rows.map((r) => r.personId) }))).toEqual([
			{ name: 'Brunner', ids: ['lea', 'max'] },
			{ name: 'Keller', ids: ['jo'] }
		]);
	});

	it('ticks rows from a sure rule and leaves possible ones unticked', () => {
		const list = groupBySurname(
			[
				{ personId: 'lea', proposal: one('Brunner', 'certain') },
				{ personId: 'max', proposal: one('Brunner', 'likely') },
				{ personId: 'maria', proposal: one('Brunner', 'possible') }
			],
			new Map()
		);
		expect(list.groups[0]?.rows.map((r) => r.preTicked)).toEqual([true, true, false]);
	});

	it('puts a choice and nothing at all in their own sections', () => {
		const list = groupBySurname(
			[
				{ personId: 'jonas', proposal: { kind: 'choose', options: [] } },
				{ personId: 'thomas', proposal: { kind: 'none' } }
			],
			new Map()
		);
		expect(list).toEqual({
			groups: [],
			chooseOne: [{ personId: 'jonas', options: [] }],
			none: ['thomas']
		});
	});
});
