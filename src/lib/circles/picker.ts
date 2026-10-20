/*
 * The circle picker (docs/02 §2.4.2): every circle the reader sees, indented as the tree nests
 * them, for *Belongs to* (choosing a parent) and for the sub-circles card's *Add existing*. A
 * circle that cannot be chosen stays in the list and says why, so nobody wonders where it went.
 * Pure and client-safe; the server checks every move again (ADR-126).
 */

import { matchesCircleQuery } from './browse';
import type { CircleTree, TreeCircle } from './tree';

/** `parent`: where a circle is to belong. `add`: which circle to put inside this one. */
export type PickerMode = 'parent' | 'add';

/**
 * Why a row cannot be chosen. `self`: the circle in question. `inside`: it lies inside it, so it
 * cannot be its parent. `contains`: it holds it, so it cannot go inside it. `alreadyIn`: a direct
 * sub-circle already. `name` is the circle in question's, for the row's reason.
 */
export type PickerBlock =
	| { reason: 'self' }
	| { reason: 'inside'; name: string }
	| { reason: 'contains'; name: string }
	| { reason: 'alreadyIn' };

/** One circle in the picker. */
export interface PickerRow {
	id: string;
	name: string;
	color: TreeCircle['color'];
	/** How far it is indented: 0 on top. */
	depth: number;
	/** The names on the way down to it, top first; empty on top. */
	path: string[];
	block: PickerBlock | null;
	/** The current choice, or (adding) a sub-circle already there. */
	checked: boolean;
	/** Adding: the parent it is moved out of, when it has one. */
	movesFrom: string | null;
}

export interface PickerQuestion {
	mode: PickerMode;
	/** The circle being placed (`parent`) or filled (`add`); null for one not made yet. */
	subjectId: string | null;
	/** The parent chosen so far (`parent`); null for none. */
	selectedId: string | null;
}

function blockFor(
	tree: CircleTree<TreeCircle>,
	question: PickerQuestion,
	circle: TreeCircle
): PickerBlock | null {
	const { mode, subjectId } = question;
	if (subjectId === null) return null;
	if (circle.id === subjectId) return { reason: 'self' };
	const name = tree.get(subjectId)?.name ?? '';
	if (mode === 'parent') {
		return tree.ancestors(circle.id).some((a) => a.id === subjectId)
			? { reason: 'inside', name }
			: null;
	}
	if (tree.ancestors(subjectId).some((a) => a.id === circle.id))
		return { reason: 'contains', name };
	if (circle.parentId === subjectId) return { reason: 'alreadyIn' };
	return null;
}

/** Every circle in `tree`, depth first as the list shows them, answering `question`. */
export function pickerRows(tree: CircleTree<TreeCircle>, question: PickerQuestion): PickerRow[] {
	const rows: PickerRow[] = [];
	const seen = new Set<string>();
	const visit = (circle: TreeCircle, path: string[]) => {
		if (seen.has(circle.id)) return;
		seen.add(circle.id);
		const block = blockFor(tree, question, circle);
		const parent = path.at(-1) ?? null;
		rows.push({
			id: circle.id,
			name: circle.name,
			color: circle.color,
			depth: path.length,
			path,
			block,
			checked:
				question.mode === 'parent'
					? circle.id === question.selectedId
					: block?.reason === 'alreadyIn',
			movesFrom: question.mode === 'add' && block === null ? parent : null
		});
		for (const child of tree.children(circle.id)) visit(child, [...path, circle.name]);
	};
	for (const top of tree.topLevel()) visit(top, []);
	return rows;
}

/**
 * The rows a search leaves, as a flat list — each one's path then says where it sits. An empty
 * query keeps the tree.
 */
export function searchPickerRows(rows: readonly PickerRow[], query: string): PickerRow[] {
	if (query.trim() === '') return [...rows];
	return rows
		.filter((r) =>
			matchesCircleQuery({ id: r.id, name: r.name, kind: '', description: null }, query)
		)
		.map((r) => ({ ...r, depth: 0 }));
}

/** What a new sub-circle of a `parentKind` circle most likely is: a school holds classes. */
export function subCircleKindFor(parentKind: string): string {
	switch (parentKind) {
		case 'school':
			return 'class';
		case 'club':
		case 'work':
			return 'team';
		default:
			return 'other';
	}
}
