import type { IconName } from '$lib/components/icons';
import { matchesQuery, startsWithQuery } from '$lib/people/directory';

/*
 * The command palette (docs/05 §5.4): the rows ⌘K shows for a query. The first row on an
 * empty query is always "Write a moment", which keeps the shortcut's original promise —
 * ⌘K then Enter lands in the capture field — while letting the same keys reach a person or
 * an action. Notes are not searched here; a typed query always ends in the full search.
 *
 * The wording arrives as `PaletteLabels` rather than being written here: this module is
 * pure and language-free, and the component hands it the viewer's language (docs/02 §2.19).
 */

/** A person as the palette needs them: names to match on, an avatar to draw. */
export interface PalettePerson {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	avatarPhotoId: string | null;
}

/** One row of the palette; `href` is where Enter goes. */
export type PaletteRow =
	| { kind: 'action'; id: string; label: string; icon: IconName; href: string }
	| { kind: 'person'; id: string; label: string; avatarPhotoId: string | null; href: string }
	| { kind: 'search'; id: 'search'; label: string; icon: IconName; href: string };

/** Most people shown at once; the query narrows the rest. */
export const PALETTE_PEOPLE_LIMIT = 6;

/** The rows Stella offers on top of the people, in the viewer's language. */
export interface PaletteLabels {
	write: string;
	addPerson: string;
	/** The last row of a non-empty query: "Search everything for …". */
	searchEverything: (query: string) => string;
}

/** The label of an action row, by the field of `PaletteLabels` that words it. */
type ActionLabel = Exclude<keyof PaletteLabels, 'searchEverything'>;

const ACTIONS: readonly { id: string; label: ActionLabel; icon: IconName; href: string }[] =
	[
		{ id: 'write', label: 'write', icon: 'write', href: '/?compose' },
		{ id: 'add-person', label: 'addPerson', icon: 'add', href: '/contacts/new' }
	];

/** The rows for a query, in the order they are shown. */
export function paletteRows(
	query: string,
	people: PalettePerson[],
	labels: PaletteLabels
): PaletteRow[] {
	const q = query.trim();
	const rows: PaletteRow[] = [];

	for (const action of ACTIONS) {
		const label = labels[action.label];
		if (q === '' || label.toLowerCase().includes(q.toLowerCase())) {
			rows.push({ kind: 'action', id: action.id, label, icon: action.icon, href: action.href });
		}
	}

	const found = people
		.map((p) => ({ ...p, description: null }))
		.filter((p) => matchesQuery(p, q))
		.sort((a, b) => Number(startsWithQuery(b, q)) - Number(startsWithQuery(a, q)))
		.slice(0, PALETTE_PEOPLE_LIMIT);
	for (const p of found) {
		rows.push({ kind: 'person', id: p.id, label: p.displayName, avatarPhotoId: p.avatarPhotoId, href: `/contacts/${p.id}` });
	}

	if (q !== '') {
		rows.push({
			kind: 'search',
			id: 'search',
			label: labels.searchEverything(q),
			icon: 'search',
			href: `/search?q=${encodeURIComponent(q)}`
		});
	}
	return rows;
}
