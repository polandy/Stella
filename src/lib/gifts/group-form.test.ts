import { describe, expect, it } from 'bun:test';
import type { PartialDate } from '../dates/partial-date';
import {
	groupOccasion,
	groupShortcuts,
	groupSummary,
	previewRows,
	recipientsField,
	shortcutPressed,
	storedBirth,
	type GroupFormRow
} from './group-form';

const TODAY = '2026-11-18';
const BIRTHS: Record<string, PartialDate | null> = {
	mia: { value: '2022-01-20', precision: 'full' },
	emma: { value: '2019-03-01', precision: 'full' },
	noah: null,
	lea: { value: '--05-04', precision: 'month_day' },
	tom: { value: '2023', precision: 'year' }
};
const birthOf = (id: string) => BIRTHS[id] ?? null;
const row = (contactId: string, more: Partial<GroupFormRow> = {}): GroupFormRow => ({
	contactId,
	ticked: true,
	...more
});

describe('storedBirth', () => {
	it('reads the precision off the shape a list carries', () => {
		expect(storedBirth(null)).toBeNull();
		expect(storedBirth('2022')).toEqual({ value: '2022', precision: 'year' });
		expect(storedBirth('--05-04')).toEqual({ value: '--05-04', precision: 'month_day' });
		expect(storedBirth('2022-01-20')).toEqual({ value: '2022-01-20', precision: 'full' });
	});
});

describe('groupShortcuts', () => {
	const names: Record<string, string> = { anna: 'Anna', tim: 'Tim', mia: 'Mia', ben: 'Ben' };
	const base = {
		anchor: { id: 'mia', name: 'Mia' },
		parentEdges: [
			{ parentId: 'anna', childId: 'mia' },
			{ parentId: 'anna', childId: 'ben' },
			{ parentId: 'tim', childId: 'mia' },
			{ parentId: 'tim', childId: 'ben' }
		],
		siblingEdges: [{ a: 'lea', b: 'mia' }],
		nameOf: (id: string) => names[id],
		homes: [{ name: 'Lindenweg 3', ids: ['anna', 'tim', 'mia', 'ben'] }],
		circles: [
			{ name: 'Kita', ids: ['mia', 'noah'] },
			{ name: 'Alone', ids: ['mia'] },
			{ name: 'Empty', ids: [] }
		]
	};

	it('offers the parents’ children, the siblings, the homes and circles, each set once', () => {
		expect(groupShortcuts(base)).toEqual([
			{ kind: 'children', name: 'Anna', ids: ['mia', 'ben'] },
			{ kind: 'siblings', name: 'Mia', ids: ['lea', 'ben'] },
			{ kind: 'home', name: 'Lindenweg 3', ids: ['anna', 'tim', 'mia', 'ben'] },
			{ kind: 'circle', name: 'Kita', ids: ['mia', 'noah'] }
		]);
	});

	it('offers a parent’s own children first', () => {
		const shortcuts = groupShortcuts({ ...base, anchor: { id: 'anna', name: 'Anna' } });
		expect(shortcuts[0]).toEqual({ kind: 'children', name: 'Anna', ids: ['mia', 'ben'] });
	});

	it('leaves out a set past the most one idea is for', () => {
		const ids = Array.from({ length: 51 }, (_, i) => `p${i}`);
		const shortcuts = groupShortcuts({ ...base, circles: [{ name: 'Big', ids }] });
		expect(shortcuts.some((s) => s.name === 'Big')).toBe(false);
	});

	it('reads as pressed only while all its people are ticked', () => {
		const kita = { kind: 'circle' as const, name: 'Kita', ids: ['mia', 'noah'] };
		expect(shortcutPressed(kita, new Set(['mia', 'noah', 'ben']))).toBe(true);
		expect(shortcutPressed(kita, new Set(['mia']))).toBe(false);
	});
});

describe('previewRows', () => {
	const fifth = { kind: 'at_age' as const, age: 5 };

	it('lists the soonest first, now before any day, later after, the grey ones last', () => {
		const rows = previewRows(
			fifth,
			[row('emma'), row('tom'), row('mia', { own: { kind: 'later' } }), row('noah', { own: null })],
			birthOf,
			TODAY
		);
		expect(rows.map((r) => r.contactId)).toEqual(['noah', 'tom', 'mia', 'emma']);
		expect(rows.map((r) => r.own)).toEqual([true, false, true, false]);
	});

	it('keeps the order given among equals', () => {
		const rows = previewRows(null, [row('mia'), row('emma'), row('noah')], birthOf, TODAY);
		expect(rows.map((r) => r.contactId)).toEqual(['mia', 'emma', 'noah']);
	});

	it('asks an age of someone with no birth date, and a birth year of one with a day only', () => {
		const rows = previewRows(fifth, [row('noah'), row('lea')], birthOf, TODAY);
		expect(rows.map((r) => [r.problem, r.fix, r.chosen])).toEqual([
			['needsBirthYear', { kind: 'estimate' }, false],
			['needsBirthYear', { kind: 'birthYear' }, false]
		]);
	});

	it('plans with an age typed for them, and carries the year it stands for', () => {
		const [noah] = previewRows(fifth, [row('noah', { age: '4' })], birthOf, TODAY);
		expect(noah).toMatchObject({ chosen: true, problem: null, estimate: '2022' });
		expect(noah.outlook).toMatchObject({ kind: 'due', on: '2027-01-01' });
	});

	it('ignores an age typed for someone whose birth date is on record', () => {
		const [mia] = previewRows(fifth, [row('mia', { age: '9' })], birthOf, TODAY);
		expect(mia.estimate).toBeNull();
	});

	it('offers the next birthday or now instead to one too old for the birthday', () => {
		const [emma] = previewRows(fifth, [row('emma')], birthOf, TODAY);
		expect(emma.fix).toEqual({
			kind: 'instead',
			offers: [
				{ pick: 'birthday', when: { kind: 'on_date', on: '2027-03-01' } },
				{ pick: 'now', when: null }
			]
		});
	});

	it('offers this Christmas or now instead to one too old for Christmas at that age (D1)', () => {
		const xmas = { kind: 'christmas_at_age' as const, age: 5 };
		const [emma] = previewRows(xmas, [row('emma')], birthOf, TODAY);
		expect(emma.fix).toEqual({
			kind: 'instead',
			offers: [
				{ pick: 'christmas', when: { kind: 'on_date', on: '2026-12-24' } },
				{ pick: 'now', when: null }
			]
		});
	});

	it('offers only now when no birthday is known to come', () => {
		const [tom] = previewRows({ kind: 'at_age', age: 1 }, [row('tom')], birthOf, TODAY);
		expect(tom.fix).toEqual({ kind: 'instead', offers: [{ pick: 'now', when: null }] });
	});

	it('notes nothing for someone unticked, though the when fits', () => {
		const [mia] = previewRows(fifth, [row('mia', { ticked: false })], birthOf, TODAY);
		expect(mia).toMatchObject({ chosen: false, problem: null });
	});
});

describe('groupSummary and recipientsField', () => {
	const fifth = { kind: 'at_age' as const, age: 5 };
	const form = [
		row('mia'),
		row('ben', { ticked: false }),
		row('emma'),
		row('noah'),
		row('lea'),
		row('tom', { age: '9', own: null })
	];
	const rows = previewRows(fifth, form, (id) => (id === 'ben' ? BIRTHS.mia : birthOf(id)), TODAY);

	it('counts those it is noted for and names why the others are left out', () => {
		expect(groupSummary(rows)).toEqual({
			chosen: 2,
			missing: [
				{ contactId: 'emma', reason: 'tooOld' },
				{ contactId: 'noah', reason: 'needsBirthYear' },
				{ contactId: 'lea', reason: 'needsBirthYear' }
			]
		});
	});

	it('carries only the chosen, each with its own when where it has one', () => {
		expect(recipientsField(rows, form)).toEqual([
			{ contactId: 'tom', when: null },
			{ contactId: 'mia' }
		]);
		const typed = previewRows(fifth, [row('noah', { age: '4' })], birthOf, TODAY);
		expect(recipientsField(typed, [row('noah', { age: '4' })])).toEqual([
			{ contactId: 'noah', birthYear: '2022' }
		]);
	});
});

describe('groupOccasion', () => {
	it('names the birthday or Christmas a when is for, and nothing else', () => {
		expect(groupOccasion({ kind: 'at_age', age: 5 })).toBe('birthday');
		expect(groupOccasion({ kind: 'christmas_at_age', age: 5 })).toBe('christmas');
		expect(groupOccasion({ kind: 'from_age', age: 5 })).toBeNull();
		expect(groupOccasion(null)).toBeNull();
	});
});
