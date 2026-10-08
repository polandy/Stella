import { giftIdeaPath } from '$lib/gifts/card';
import { foundByFormerName } from '$lib/people/former-name';
import { foundByJob, jobOf, type Job } from '$lib/people/job';
import type { IconName } from '$lib/components/ui/icons';
import { matchesQuery, startsWithQuery } from '$lib/people/directory';
import type { PersonContext } from '$lib/people/context';
import { tellApart, type Distinction } from '$lib/people/namesakes';

/*
 * The command palette (docs/05 §5.4): the rows ⌘K shows for a query. The first row on an
 * empty query is always "Write a moment", which keeps the shortcut's original promise —
 * ⌘K then Enter lands in the capture field — while letting the same keys reach a person or
 * an action. Notes are not searched here; a typed query always ends in the full search.
 *
 * Most rows go somewhere. *Gift idea for …* asks something first: it turns the palette into a
 * second step, `giftIdea`, which lists only people, each leading to their idea form.
 *
 * The wording arrives as `PaletteLabels` rather than being written here: this module is
 * pure and language-free, and the component hands it the viewer's language (docs/02 §2.19).
 */

/**
 * A person as the palette needs them: names to match on, an avatar to draw, and what tells
 * them apart from a namesake (docs/02 §2.2.3).
 */
export interface PalettePerson {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	/** An earlier name, which finds them too (docs/02 §2.2). */
	formerName?: string | null;
	avatarPhotoId: string | null;
	description?: string | null;
	metPlace?: string | null;
	metDate?: string | null;
	/** What they do and where, which finds them too and is shown on its own line (docs/02 §2.2). */
	jobTitle?: string | null;
	company?: string | null;
}

/** What the palette is asking: anything (`start`), or whom a gift idea is for. */
export type PaletteStep = 'start' | 'giftIdea';

/** One row of the palette; `href` is where Enter goes, `step` what the palette asks next. */
export type PaletteRow =
	| { kind: 'action'; id: string; label: string; icon: IconName; href: string }
	| { kind: 'step'; id: string; label: string; icon: IconName; step: PaletteStep }
	| {
			kind: 'person';
			id: string;
			label: string;
			avatarPhotoId: string | null;
			/** The second line, only when someone else in the household shares the name. */
			distinction: Distinction | null;
			/** The former name the query found them by, said after the name (docs/02 §2.9). */
			formerly: string | null;
			/** Their job, for its own line under the name, or null when none is on record. */
			job: Job | null;
			/** Only the job explains the match, so the row says *Job* (docs/02 §2.9). */
			foundByJob: boolean;
			href: string;
	  }
	| { kind: 'search'; id: 'search'; label: string; icon: IconName; href: string };

/** A row a search for people yields: a person, or the way into full search. Each goes somewhere. */
export type PersonSearchRow = Extract<PaletteRow, { kind: 'person' | 'search' }>;

/** Most people shown at once; the query narrows the rest. */
export const PALETTE_PEOPLE_LIMIT = 6;

/** The rows Stella offers on top of the people, in the viewer's language. */
export interface PaletteLabels {
	write: string;
	giftIdea: string;
	addPerson: string;
	/** The last row of a non-empty query: "Search everything for …". */
	searchEverything: (query: string) => string;
}

/** The label of an action row, by the field of `PaletteLabels` that words it. */
type ActionLabel = Exclude<keyof PaletteLabels, 'searchEverything'>;

const ACTIONS: readonly ({ id: string; label: ActionLabel; icon: IconName } & (
	{ href: string } | { step: PaletteStep }
))[] = [
	{ id: 'write', label: 'write', icon: 'write', href: '/?compose' },
	{ id: 'gift-idea', label: 'giftIdea', icon: 'gift', step: 'giftIdea' },
	{ id: 'add-person', label: 'addPerson', icon: 'add', href: '/contacts/new' }
];

/** The rows for a query, in the order they are shown. */
export function paletteRows(
	query: string,
	people: PalettePerson[],
	labels: PaletteLabels,
	/** What the namesake line falls back on, by person (docs/02 §2.2.3). */
	contexts: ReadonlyMap<string, PersonContext> = new Map(),
	step: PaletteStep = 'start'
): PaletteRow[] {
	const q = query.trim();
	if (step === 'giftIdea') {
		// Only whom it is for: a name nobody matches has no idea form to land on.
		return personSearchRows(q, people, labels.searchEverything, contexts, {
			listAllWhenEmpty: true
		})
			.filter((row) => row.kind === 'person')
			.map((row) => ({ ...row, href: giftIdeaPath(row.id) }));
	}

	const rows: PaletteRow[] = [];
	for (const action of ACTIONS) {
		const label = labels[action.label];
		if (q !== '' && !label.toLowerCase().includes(q.toLowerCase())) continue;
		const { id, icon } = action;
		rows.push(
			'href' in action
				? { kind: 'action', id, label, icon, href: action.href }
				: { kind: 'step', id, label, icon, step: action.step }
		);
	}

	rows.push(
		...personSearchRows(q, people, labels.searchEverything, contexts, { listAllWhenEmpty: true })
	);
	return rows;
}

/**
 * The rows of a search for people alone — the home screen's search field (docs/02 §2.22.1):
 * the people whose name matches, then a way into full search. The palette adds its actions
 * on top; the home field has none, and offers nothing until something is typed.
 */
export function personSearchRows(
	query: string,
	people: PalettePerson[],
	searchEverything: PaletteLabels['searchEverything'],
	contexts: ReadonlyMap<string, PersonContext> = new Map(),
	/** The palette doubles as a jump list, so it shows people before anything is typed. */
	{ listAllWhenEmpty = false }: { listAllWhenEmpty?: boolean } = {}
): PersonSearchRow[] {
	const q = query.trim();
	if (q === '' && !listAllWhenEmpty) return [];

	const namesakes = tellApart(people, contexts);
	const rows: PersonSearchRow[] = people
		// Matched by name and job; the description is shown, not searched — full search reads it.
		.map((p) => ({ ...p, description: null }))
		.filter((p) => matchesQuery(p, q))
		.sort((a, b) => Number(startsWithQuery(b, q)) - Number(startsWithQuery(a, q)))
		.slice(0, PALETTE_PEOPLE_LIMIT)
		.map((p) => ({
			kind: 'person',
			id: p.id,
			label: p.displayName,
			avatarPhotoId: p.avatarPhotoId,
			distinction: namesakes.get(p.id) ?? null,
			formerly: foundByFormerName(p, q),
			job: jobOf(p),
			foundByJob: foundByJob(p, q),
			href: `/contacts/${p.id}`
		}));

	if (q !== '') {
		rows.push({
			kind: 'search',
			id: 'search',
			label: searchEverything(q),
			icon: 'search',
			href: `/search?q=${encodeURIComponent(q)}`
		});
	}
	return rows;
}
