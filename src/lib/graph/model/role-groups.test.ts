import { describe, expect, it } from 'bun:test';
import { groupByRole, isRoleGroupId, linksOfGrouped } from './role-groups';
import type { GraphEdge, GraphModel, GraphNode } from './types';

/*
 * Grouping a circle's members by role (docs/02 §2.7): everyone holding the same role in a
 * circle stands in one group, joined to the circle by one line; links between two groups are
 * bundled, links to the outside stay with the person.
 */

const person = (id: string): GraphNode => ({ id, kind: 'person', label: id });
const circle = (id: string): GraphNode => ({ id, kind: 'circle', label: id });
const member = (circleId: string, personId: string, role: string | null): GraphEdge => ({
	id: `${circleId}-${personId}`,
	source: circleId,
	target: personId,
	kind: 'membership',
	...(role === null ? {} : { label: role })
});
const link = (
	id: string,
	source: string,
	target: string,
	category: GraphEdge['category'] = 'family'
): GraphEdge => ({ id, source, target, kind: 'relationship', category });

/**
 * A swimming club: three children, two parents, one coach, two members without a role —
 * and Andy, who is in no circle but is Lena's father.
 */
const club: GraphModel = {
	nodes: [
		circle('swim'),
		...['lena', 'juri', 'leo', 'fabienne', 'thomas', 'sabine', 'hans', 'ida', 'andy'].map(person)
	],
	edges: [
		member('swim', 'lena', 'Child'),
		member('swim', 'juri', 'Child'),
		member('swim', 'leo', 'Child'),
		member('swim', 'fabienne', 'Parent'),
		member('swim', 'thomas', 'Parent'),
		member('swim', 'sabine', 'Coach'),
		member('swim', 'hans', null),
		member('swim', 'ida', null),
		link('siblings', 'juri', 'leo'),
		link('mother-juri', 'fabienne', 'juri'),
		link('mother-leo', 'fabienne', 'leo'),
		link('father-lena', 'andy', 'lena'),
		link('coach-friend', 'sabine', 'thomas', 'social')
	]
};

const on = { innerLinks: true };
const groupsOf = (model: GraphModel) =>
	groupByRole(model, on).groups.map((g) => ({ role: g.role, members: g.memberIds }));

describe('groupByRole', () => {
	it('groups everyone holding the same role in a circle, biggest role first', () => {
		expect(groupsOf(club)).toEqual([
			{ role: 'Child', members: ['lena', 'juri', 'leo'] },
			{ role: 'Parent', members: ['fabienne', 'thomas'] },
			{ role: null, members: ['hans', 'ida'] }
		]);
	});

	it('leaves a role only one person holds as an ordinary node', () => {
		const grouping = groupByRole(club, on);

		expect(grouping.groupOf.has('sabine')).toBe(false);
		expect(grouping.tucked.has('swim-sabine')).toBe(false);
	});

	it('joins each group to its circle with one line standing for every membership in it', () => {
		const grouping = groupByRole(club, on);
		const children = grouping.groups[0];
		const line = grouping.bundles.find((b) => b.target === children.id)!;

		expect(line).toMatchObject({ source: 'swim', kind: 'membership' });
		expect(line.edgeIds.sort()).toEqual(['swim-juri', 'swim-lena', 'swim-leo']);
		expect(['swim-juri', 'swim-lena', 'swim-leo'].every((id) => grouping.tucked.has(id))).toBe(
			true
		);
	});

	it('bundles two or more links of one kind between two groups into one line', () => {
		const grouping = groupByRole(club, on);
		const [children, parents] = grouping.groups;
		const family = grouping.bundles.filter((b) => b.kind === 'relationship');

		expect(family).toHaveLength(1);
		expect(family[0]).toMatchObject({ category: 'family' });
		expect([family[0].source, family[0].target].sort()).toEqual([children.id, parents.id].sort());
		expect(family[0].edgeIds.sort()).toEqual(['mother-juri', 'mother-leo']);
		expect(grouping.tucked.has('mother-juri')).toBe(true);
	});

	it('leaves a single link between two groups as it is', () => {
		const single: GraphModel = {
			nodes: club.nodes,
			edges: club.edges.filter((e) => e.id !== 'mother-leo')
		};
		const grouping = groupByRole(single, on);

		expect(grouping.bundles.filter((b) => b.kind === 'relationship')).toEqual([]);
		expect(grouping.tucked.has('mother-juri')).toBe(false);
	});

	it('keeps links to people outside every group with the person', () => {
		const grouping = groupByRole(club, on);

		expect(grouping.tucked.has('father-lena')).toBe(false);
		expect(grouping.tucked.has('coach-friend')).toBe(false);
	});

	it('draws links inside a group, or tucks them away when the switch is off', () => {
		expect(groupByRole(club, { innerLinks: true }).tucked.has('siblings')).toBe(false);
		expect(groupByRole(club, { innerLinks: false }).tucked.has('siblings')).toBe(true);
	});

	it('sets someone in several circles in a group of the biggest', () => {
		const model: GraphModel = {
			nodes: [...club.nodes, circle('choir'), person('mia')],
			edges: [...club.edges, member('choir', 'juri', 'Singer'), member('choir', 'mia', 'Singer')]
		};
		const grouping = groupByRole(model, on);

		expect(grouping.groupOf.get('juri')).toBe(grouping.groups[0].id);
		// The choir is left with one singer, who stands alone.
		expect(grouping.groupOf.has('mia')).toBe(false);
		expect(grouping.tucked.has('choir-juri')).toBe(false);
	});

	it('lets a person left out of the biggest circle group with the next', () => {
		const model: GraphModel = {
			nodes: [...club.nodes, circle('choir'), person('mia')],
			edges: [...club.edges, member('choir', 'sabine', 'Singer'), member('choir', 'mia', 'Singer')]
		};
		const grouping = groupByRole(model, on);
		const singers = grouping.groups.find((g) => g.circleId === 'choir')!;

		expect(singers.memberIds).toEqual(['sabine', 'mia']);
	});

	it('shows a dissolved group individually, and only that one', () => {
		const children = groupByRole(club, on).groups[0].id;
		const grouping = groupByRole(club, { innerLinks: true, dissolved: new Set([children]) });

		expect(grouping.groups.map((g) => g.role)).toEqual(['Parent', null]);
		expect(grouping.tucked.has('swim-lena')).toBe(false);
		expect(grouping.tucked.has('mother-juri')).toBe(false);
	});

	it('gives a group the same id every time, so it can be dissolved and found again', () => {
		const once = groupByRole(club, on).groups.map((g) => g.id);
		const again = groupByRole(club, on).groups.map((g) => g.id);

		expect(new Set(once).size).toBe(once.length);
		expect(again).toEqual(once);
	});

	it('tells a group id from a person or circle id', () => {
		const [children] = groupByRole(club, on).groups;

		expect(isRoleGroupId(children.id)).toBe(true);
		expect(isRoleGroupId('swim')).toBe(false);
		expect(isRoleGroupId('lena')).toBe(false);
	});

	it('forms no groups without membership lines', () => {
		const noCircles: GraphModel = {
			nodes: club.nodes,
			edges: club.edges.filter((e) => e.kind !== 'membership')
		};

		expect(groupByRole(noCircles, on)).toMatchObject({ groups: [], bundles: [] });
	});
});

describe('linksOfGrouped', () => {
	// The map holds only what was opened up: a circle's members arrive without their links to
	// each other. A group is about how its people belong together, so those come along.
	const snapshot: GraphModel = {
		nodes: [...club.nodes, person('stranger')],
		edges: [...club.edges, link('lena-stranger', 'lena', 'stranger')]
	};
	const onMap = new Set(club.nodes.map((n) => n.id));
	const grouped = new Set(['lena', 'juri', 'leo', 'fabienne', 'thomas']);

	it('brings the links between grouped people, and from them to anybody else on the map', () => {
		const ids = linksOfGrouped(snapshot, onMap, grouped).map((e) => e.id);

		expect(ids.sort()).toEqual(
			['coach-friend', 'father-lena', 'mother-juri', 'mother-leo', 'siblings'].sort()
		);
	});

	it('leaves out links to people not on the map, and memberships', () => {
		const ids = linksOfGrouped(snapshot, onMap, grouped).map((e) => e.id);

		expect(ids).not.toContain('lena-stranger');
		expect(ids.some((id) => id.startsWith('swim-'))).toBe(false);
	});
});

