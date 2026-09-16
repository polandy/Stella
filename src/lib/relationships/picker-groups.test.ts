import { describe, expect, it } from 'bun:test';
import type { Exclusion } from './exclusions';
import { firstPickable, groupByExclusion } from './picker-groups';
import { relationshipTypeOptions } from './type-options';

/*
 * Why the reason is not written into the entry (docs/02 §2.4). "Grandparent of — already
 * Godchild of Bert Weber" puts two "X of Y" phrases in one line, and a reader takes the
 * second as a statement about the first: it looks as though Stella is calling the entry a
 * godchild. The entries keep their own words and the reason is said once, above the run of
 * entries it refuses.
 */

const type = (id: string, symmetric = true) => ({ id, symmetric });
const options = relationshipTypeOptions([
	type('parent_child', false),
	type('sibling'),
	type('spouse'),
	type('friend'),
	type('colleague')
]);

const tied: Exclusion = {
	reason: 'alreadyRomantic',
	personId: 'bert',
	tie: { typeKey: 'godparent_of', side: 'reverse', label: 'Godchild of' }
};
const taken: Exclusion = { reason: 'romanticTaken', personId: 'anna', partnerId: 'carl' };

const ids = (group: { options: { type: { id: string } }[] }) =>
	group.options.map((option) => option.type.id);

describe('groupByExclusion', () => {
	it('leaves one open group when nothing is refused', () => {
		const groups = groupByExclusion(options, () => null);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.exclusion).toBeNull();
		expect(groups[0]?.options).toHaveLength(options.length);
	});

	it('gathers a run refused for the same reason under that one reason', () => {
		const family = new Set(['parent_child', 'sibling', 'spouse']);
		const groups = groupByExclusion(options, (option) =>
			family.has(option.type.id) ? tied : null
		);
		expect(groups.map((group) => group.exclusion?.reason ?? null)).toEqual([
			'alreadyRomantic',
			null
		]);
		expect(ids(groups[0]!)).toEqual(['parent_child', 'parent_child', 'sibling', 'spouse']);
		expect(ids(groups[1]!)).toEqual(['friend', 'colleague']);
	});

	it('splits two different reasons rather than lumping them together', () => {
		const groups = groupByExclusion(options, (option) => {
			if (option.type.id === 'sibling') return tied;
			if (option.type.id === 'spouse') return taken;
			return null;
		});
		expect(groups.map((group) => group.exclusion?.reason ?? null)).toEqual([
			null,
			'alreadyRomantic',
			'romanticTaken',
			null
		]);
	});

	it('splits the same reason about two different people', () => {
		const otherPerson: Exclusion = { ...taken, personId: 'dora', partnerId: 'dora' };
		const groups = groupByExclusion(options, (option) => {
			if (option.type.id === 'sibling') return taken;
			if (option.type.id === 'spouse') return otherPerson;
			return null;
		});
		expect(groups.map((group) => group.exclusion?.personId ?? null)).toEqual([
			null,
			'anna',
			'dora',
			null
		]);
	});

	it('splits the same person spoken for by two different partners', () => {
		const otherPartner: Exclusion = { ...taken, partnerId: 'dora' };
		const groups = groupByExclusion(options, (option) => {
			if (option.type.id === 'sibling') return taken;
			if (option.type.id === 'spouse') return otherPartner;
			return null;
		});
		expect(groups.map((group) => group.exclusion?.partnerId ?? null)).toEqual([
			null,
			'carl',
			'dora',
			null
		]);
	});

	it('splits the same reason naming two different links', () => {
		const otherTie: Exclusion = {
			...tied,
			tie: { typeKey: 'parent_child', side: 'reverse', label: 'Child of' }
		};
		const groups = groupByExclusion(options, (option) => {
			if (option.type.id === 'sibling') return tied;
			if (option.type.id === 'spouse') return otherTie;
			return null;
		});
		expect(groups.map((group) => group.exclusion?.tie?.label ?? null)).toEqual([
			null,
			'Godchild of',
			'Child of',
			null
		]);
	});

	it('keeps every entry, in the order the picker offers them', () => {
		const groups = groupByExclusion(options, (option) =>
			option.type.id === 'sibling' ? tied : null
		);
		expect(groups.flatMap((group) => group.options.map((option) => option.value))).toEqual(
			options.map((option) => option.value)
		);
	});
});

/*
 * A select that was never touched does not stand on its first entry — it stands on the first
 * entry that can be picked, skipping the disabled ones. Reading it as "the first entry" is
 * what greyed the Add button out while a perfectly pickable "Friend of" was on screen.
 */
describe('firstPickable', () => {
	it('skips the refused entries the way the control does', () => {
		const family = new Set(['parent_child', 'sibling', 'spouse']);
		expect(
			firstPickable(options, (option) => (family.has(option.type.id) ? tied : null))?.type.id
		).toBe('friend');
	});

	it('is the very first entry when nothing is refused', () => {
		expect(firstPickable(options, () => null)?.type.id).toBe('parent_child');
	});

	it('is nothing when every entry is refused', () => {
		expect(firstPickable(options, () => tied)).toBeNull();
	});
});
