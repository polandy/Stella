import { describe, expect, it } from 'bun:test';
import { textOf } from '$lib/i18n/linked';
import { createTranslator } from '$lib/i18n/translate';
import type { KinshipGraph } from '$lib/kinship/kinship';
import {
	buildSurnameView,
	foldSurname,
	proposeSurname,
	type SurnameFacts,
	type SurnamePerson,
	type SurnameProposal
} from './surnames';

/*
 * Where a last name can come from (docs/02 §2.2.4.1): the rules F1–F3 and F9–F11,
 * and how their proposals combine for one person. Pure: the facts are what one viewer may see.
 */

const en = createTranslator('en');

const person = (
	id: string,
	first: string | null,
	last: string | null,
	extra: Partial<SurnamePerson> = {}
): SurnamePerson => ({
	id,
	displayName: [first, last].filter(Boolean).join(' ') || id,
	firstName: first,
	lastName: last,
	nickname: null,
	formerName: null,
	...extra
});

const noGraph: Omit<KinshipGraph, 'people'> = {
	parentEdges: [],
	siblingEdges: [],
	partnerEdges: [],
	storedPairs: []
};

function facts(
	people: SurnamePerson[],
	graph: Partial<Omit<KinshipGraph, 'people'>> = {},
	more: Partial<Pick<SurnameFacts, 'familyCircles' | 'dismissed'>> = {}
): SurnameFacts {
	return {
		people,
		graph: {
			...noGraph,
			...graph,
			people: people.map((p) => ({ id: p.id, displayName: p.displayName }))
		},
		familyCircles: more.familyCircles ?? [],
		dismissed: more.dismissed ?? []
	};
}

/** The proposal as plain values, its reasons said in English. */
function said(proposal: SurnameProposal) {
	const reasons = (list: readonly import('$lib/i18n/linked').LinkedPhrase[]) =>
		list.map((r) => textOf(r(en)));
	switch (proposal.kind) {
		case 'none':
			return { kind: 'none' };
		case 'one':
			return {
				kind: 'one',
				name: proposal.name,
				confidence: proposal.confidence,
				reasons: reasons(proposal.reasons),
				alternatives: proposal.alternatives
			};
		case 'choose':
			return {
				kind: 'choose',
				options: proposal.options.map((o) => ({ name: o.name, reasons: reasons(o.reasons) }))
			};
	}
}

const propose = (f: SurnameFacts, id: string) => said(proposeSurname(buildSurnameView(f), id));

const peter = person('peter', 'Peter', 'Brunner');
const lea = person('lea', 'Lea', null);
const max = person('max', 'Max', null);

describe('foldSurname', () => {
	it('ignores case, diacritics and stray spaces', () => {
		expect(foldSurname('  Müller ')).toBe(foldSurname('muller'));
		expect(foldSurname('van der  Berg')).toBe('van der berg');
	});
});

describe('F1 — a parent with a last name', () => {
	it('proposes the parent’s name, likely', () => {
		const f = facts([peter, lea], { parentEdges: [{ parentId: 'peter', childId: 'lea' }] });
		expect(propose(f, 'lea')).toEqual({
			kind: 'one',
			name: 'Brunner',
			confidence: 'likely',
			reasons: ['Child of Peter Brunner'],
			alternatives: []
		});
	});

	it('offers nothing for someone who already has a last name', () => {
		const f = facts([peter, person('anna', 'Anna', 'Meier')], {
			parentEdges: [{ parentId: 'peter', childId: 'anna' }]
		});
		expect(propose(f, 'anna')).toEqual({ kind: 'none' });
	});
});

describe('F1b — two parents with different last names', () => {
	it('asks to choose one, picking no winner', () => {
		const anna = person('anna', 'Anna', 'Keller');
		const tom = person('tom', 'Tom', 'Weber');
		const jonas = person('jonas', 'Jonas', null);
		const f = facts([anna, tom, jonas], {
			parentEdges: [
				{ parentId: 'anna', childId: 'jonas' },
				{ parentId: 'tom', childId: 'jonas' }
			]
		});
		expect(propose(f, 'jonas')).toEqual({
			kind: 'choose',
			options: [
				{ name: 'Keller', reasons: ['Child of Anna Keller'] },
				{ name: 'Weber', reasons: ['Child of Tom Weber'] }
			]
		});
	});
});

describe('F2 — siblings with a last name', () => {
	it('proposes the name all named siblings share, and merges reasons for the same name', () => {
		const sophie = person('sophie', 'Sophie', 'Brunner');
		const f = facts([peter, sophie, max], {
			parentEdges: [{ parentId: 'peter', childId: 'max' }],
			siblingEdges: [{ a: 'max', b: 'sophie' }]
		});
		expect(propose(f, 'max')).toMatchObject({
			kind: 'one',
			name: 'Brunner',
			reasons: ['Child of Peter Brunner', 'Sibling of Sophie Brunner']
		});
	});

	it('offers nothing when the named siblings disagree', () => {
		const f = facts([person('a', 'A', 'Keller'), person('b', 'B', 'Weber'), max], {
			siblingEdges: [
				{ a: 'max', b: 'a' },
				{ a: 'max', b: 'b' }
			]
		});
		expect(propose(f, 'max')).toEqual({ kind: 'none' });
	});
});

describe('F3 — a partner with a last name', () => {
	it('proposes it as possible, naming the partner’s former name', () => {
		const maria = person('maria', 'Maria', null);
		const f = facts([{ ...peter, formerName: 'Keller' }, maria], {
			partnerEdges: [{ a: 'peter', b: 'maria' }]
		});
		expect(propose(f, 'maria')).toMatchObject({
			kind: 'one',
			name: 'Brunner',
			confidence: 'possible',
			reasons: ['Partner of Peter Brunner, born Keller']
		});
	});

	it('never reads a former partnership', () => {
		const maria = person('maria', 'Maria', null);
		const f = facts([peter, maria], { partnerEdges: [{ a: 'peter', b: 'maria', former: true }] });
		expect(propose(f, 'maria')).toEqual({ kind: 'none' });
	});
});

describe('F9 — the shown name already holds a last name', () => {
	it('proposes the words after the first name, certain', () => {
		const thomas = person('thomas', 'Thomas', null, { displayName: 'Thomas van der Berg' });
		expect(propose(facts([thomas]), 'thomas')).toMatchObject({
			kind: 'one',
			name: 'van der Berg',
			confidence: 'certain'
		});
	});

	it('reads the words after the first one when there is no first name either', () => {
		const imported = person('imp', null, null, { displayName: 'Thomas Brunner' });
		expect(propose(facts([imported]), 'imp')).toMatchObject({ kind: 'one', name: 'Brunner' });
	});

	it('reads nothing from a single word or a shown name that is the nickname', () => {
		const single = person('one', 'Thomas', null, { displayName: 'Thomas' });
		const nick = person('nick', null, null, { displayName: 'Big Tom', nickname: 'Big Tom' });
		expect(propose(facts([single, nick]), 'one')).toEqual({ kind: 'none' });
		expect(propose(facts([single, nick]), 'nick')).toEqual({ kind: 'none' });
	});

	it('wins over a likely name, which is kept as an alternative', () => {
		const thomas = person('thomas', 'Thomas', null, { displayName: 'Thomas Weber' });
		const f = facts([peter, thomas], { parentEdges: [{ parentId: 'peter', childId: 'thomas' }] });
		expect(propose(f, 'thomas')).toMatchObject({
			kind: 'one',
			name: 'Weber',
			alternatives: ['Brunner']
		});
	});
});

describe('F10 — children who share a last name', () => {
	it('proposes it as possible', () => {
		const anna = person('anna', 'Anna', null);
		const f = facts([anna, person('kid', 'Kid', 'Brunner')], {
			parentEdges: [{ parentId: 'anna', childId: 'kid' }]
		});
		expect(propose(f, 'anna')).toMatchObject({
			kind: 'one',
			name: 'Brunner',
			confidence: 'possible',
			reasons: ['Parent of Kid Brunner']
		});
	});
});

describe('F11 — a family circle whose named members share one name', () => {
	it('proposes it, likely, reading the circle’s kind and never its name', () => {
		const sophie = person('sophie', 'Sophie', null);
		const f = facts(
			[peter, sophie],
			{},
			{ familyCircles: [{ id: 'fam', name: 'Familie Brunner', memberIds: ['peter', 'sophie'] }] }
		);
		expect(propose(f, 'sophie')).toMatchObject({
			kind: 'one',
			name: 'Brunner',
			confidence: 'likely',
			reasons: ['In the circle Familie Brunner']
		});
	});

	it('offers nothing when the named members disagree', () => {
		const sophie = person('sophie', 'Sophie', null);
		const f = facts(
			[peter, person('w', 'W', 'Weber'), sophie],
			{},
			{
				familyCircles: [{ id: 'fam', name: 'Family', memberIds: ['peter', 'w', 'sophie'] }]
			}
		);
		expect(propose(f, 'sophie')).toEqual({ kind: 'none' });
	});
});

describe('combining', () => {
	it('keeps a likely name over a possible one, offering the other as an alternative', () => {
		const maria = person('maria', 'Maria', null);
		const mum = person('mum', 'Mum', 'Keller');
		const f = facts([peter, maria, mum], {
			parentEdges: [{ parentId: 'mum', childId: 'maria' }],
			partnerEdges: [{ a: 'peter', b: 'maria' }]
		});
		expect(propose(f, 'maria')).toMatchObject({
			kind: 'one',
			name: 'Keller',
			alternatives: ['Brunner']
		});
	});

	it('drops a name the household declined for this person, folded', () => {
		const f = facts(
			[peter, lea],
			{ parentEdges: [{ parentId: 'peter', childId: 'lea' }] },
			{
				dismissed: [{ contactId: 'lea', folded: foldSurname('BRÜNNER') }]
			}
		);
		const other = facts(
			[peter, lea],
			{ parentEdges: [{ parentId: 'peter', childId: 'lea' }] },
			{
				dismissed: [{ contactId: 'max', folded: foldSurname('Brunner') }]
			}
		);
		expect(propose(f, 'lea')).toEqual({ kind: 'none' });
		// positive control: a *no* about somebody else leaves Lea's proposal standing
		expect(propose(other, 'lea')).toMatchObject({ kind: 'one', name: 'Brunner' });
	});

	it('proposes nothing for someone outside the facts', () => {
		expect(propose(facts([peter]), 'ghost')).toEqual({ kind: 'none' });
	});
});
