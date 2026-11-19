import { giftIdeaPath } from '$lib/gifts/card';
import { giftGroupPath } from '$lib/gifts/group-form';
import { newPlanPath } from '$lib/plans/plans';
import { newTodoPath } from '$lib/todos/todos';
import { briefPath } from '$lib/people/sections';
import { foundByFormerName } from '$lib/people/former-name';
import { foundByJob, jobOf, type Job } from '$lib/people/job';
import type { IconName } from '$lib/components/ui/icons';
import { matchesQuery, startsWithQuery } from '$lib/people/directory';
import type { PersonContext } from '$lib/people/context';
import type { Translate } from '$lib/i18n/translate';
import { tellApart, type Distinction } from '$lib/people/namesakes';

/*
 * The command palette (docs/dev/05 §5.4): the rows ⌘K shows for a query. The first row on an
 * empty query is always "Write a moment", which keeps the shortcut's original promise —
 * ⌘K then Enter lands in the capture field — while letting the same keys reach a person or
 * an action. Notes are not searched here; a typed query always ends in the full search.
 *
 * Most rows go somewhere. *Gift idea for …*, *To-do for …*, *Outing with …* and *Brief for …* ask
 * something first: each turns the palette into a second step, `giftIdea`, `giftForSeveral`,
 * `todo`, `plan` or `brief`, which lists only people, each leading to their idea form (or the
 * form for several, starting with them, §2.25.11), their To-dos card's form
 * (docs/dev/02 §2.26), their Outings card's form (§2.27) or their brief (docs/dev/02 §2.2.5).
 *
 * The wording arrives as `PaletteLabels` rather than being written here: this module is
 * pure and language-free, and the component hands it the viewer's language (docs/dev/02 §2.19).
 */

/** An action's label as typed: *to do*, *to-do* and *todo* all find *To-do for …*. */
const foldAction = (text: string): string => text.toLowerCase().replace(/[\s-]+/g, '');

/**
 * A person as the palette needs them: names to match on, an avatar to draw, and what tells
 * them apart from a namesake (docs/dev/02 §2.2.3).
 */
export interface PalettePerson {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	/** An earlier name, which finds them too (docs/dev/02 §2.2). */
	formerName?: string | null;
	avatarPhotoId: string | null;
	description?: string | null;
	metPlace?: string | null;
	metDate?: string | null;
	/** What they do and where, which finds them too and is shown on its own line (docs/dev/02 §2.2). */
	jobTitle?: string | null;
	company?: string | null;
}

/** What the palette is asking: anything (`start`), whom a gift idea or a to-do is for. */
export type PaletteStep = 'start' | 'giftIdea' | 'giftForSeveral' | 'todo' | 'plan' | 'brief';

/** Where each person of a second step leads. */
const PERSON_STEP_PATH = {
	giftIdea: giftIdeaPath,
	giftForSeveral: giftGroupPath,
	todo: newTodoPath,
	plan: newPlanPath,
	brief: briefPath
} as const satisfies Record<Exclude<PaletteStep, 'start'>, (contactId: string) => string>;

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
			/** The former name the query found them by, said after the name (docs/dev/02 §2.9). */
			formerly: string | null;
			/** Their job, for its own line under the name, or null when none is on record. */
			job: Job | null;
			/** Only the job explains the match, so the row says *Job* (docs/dev/02 §2.9). */
			foundByJob: boolean;
			href: string;
	  }
	| { kind: 'search'; id: 'search'; label: string; icon: IconName; href: string };

/** A row a search for people yields: a person, or the way into full search. Each goes somewhere. */
export type PersonSearchRow = Extract<PaletteRow, { kind: 'person' | 'search' }>;

/** A row of the home field: a person, the full search, or a list to open. */
export type FinderRow = Extract<PaletteRow, { kind: 'person' | 'search' | 'action' }>;

/** Most people shown at once; the query narrows the rest. */
export const PALETTE_PEOPLE_LIMIT = 6;

/** The rows Stella offers on top of the people, in the viewer's language. */
export interface PaletteLabels {
	write: string;
	giftIdea: string;
	/** *Gift idea for several …*, one idea for several people (docs/dev/02 §2.25.11). */
	giftForSeveral: string;
	/** The household's list of every open idea (docs/dev/02 §2.25.6). */
	giftIdeas: string;
	/** *To-do for …*, a to-do on a person (docs/dev/02 §2.26). */
	todoFor: string;
	/** *Brief for …*, what to know before a visit (docs/dev/02 §2.2.5). */
	briefFor: string;
	/** The household's list of every open to-do (docs/dev/02 §2.26.6). */
	allTodos: string;
	/** *Outing with …*, an outing idea with a person (docs/dev/02 §2.27). */
	planWith: string;
	/** The household's list of every open outing idea (docs/dev/02 §2.27.9). */
	allPlans: string;
	/** *On this day*, the household's earlier years on today's date (docs/dev/02 §2.12.1). */
	onThisDay: string;
	addPerson: string;
	/** The last row of a non-empty query: "Search everything for …". */
	searchEverything: (query: string) => string;
}

/** The viewer's wording for the rows, from the translator. */
export function paletteLabels(t: Translate): PaletteLabels {
	return {
		write: t('components.palette.write'),
		giftIdea: t('components.palette.giftIdea'),
		giftForSeveral: t('components.palette.giftForSeveral'),
		giftIdeas: t('components.palette.giftIdeas'),
		todoFor: t('components.palette.todoFor'),
		briefFor: t('components.palette.briefFor'),
		allTodos: t('components.palette.allTodos'),
		planWith: t('components.palette.planWith'),
		allPlans: t('plans.allIdeas'),
		onThisDay: t('memories.title'),
		addPerson: t('components.palette.addPerson'),
		searchEverything: (q) => t('components.palette.searchEverything', { query: q })
	};
}

/** The label of an action row, by the field of `PaletteLabels` that words it. */
type ActionLabel = Exclude<keyof PaletteLabels, 'searchEverything'>;

/** The heading an empty palette files a row under (docs/dev/05 §5.4). */
export type PaletteGroup = 'new' | 'lists' | 'people';

/* In the order shown, a group's rows together; *Write a moment* stays first. */
const ACTIONS: readonly ({
	id: string;
	label: ActionLabel;
	icon: IconName;
	group: Exclude<PaletteGroup, 'people'>;
} & ({ href: string } | { step: PaletteStep }))[] = [
	{ id: 'write', label: 'write', icon: 'write', href: '/?compose', group: 'new' },
	{ id: 'add-person', label: 'addPerson', icon: 'add', href: '/contacts/new', group: 'new' },
	{ id: 'gift-idea', label: 'giftIdea', icon: 'gift', step: 'giftIdea', group: 'new' },
	{
		id: 'gift-several',
		label: 'giftForSeveral',
		icon: 'people',
		step: 'giftForSeveral',
		group: 'new'
	},
	{ id: 'todo', label: 'todoFor', icon: 'todo', step: 'todo', group: 'new' },
	{ id: 'plan', label: 'planWith', icon: 'explore', step: 'plan', group: 'new' },
	{ id: 'gift-ideas', label: 'giftIdeas', icon: 'idea', href: '/gifts', group: 'lists' },
	{ id: 'all-todos', label: 'allTodos', icon: 'todo', href: '/todos', group: 'lists' },
	{ id: 'all-plans', label: 'allPlans', icon: 'explore', href: '/plans', group: 'lists' },
	{ id: 'on-this-day', label: 'onThisDay', icon: 'memories', href: '/on-this-day', group: 'lists' },
	{ id: 'brief', label: 'briefFor', icon: 'brief', step: 'brief', group: 'lists' }
];

const GROUP_OF_ACTION: ReadonlyMap<string, PaletteGroup> = new Map(
	ACTIONS.map((action) => [action.id, action.group])
);

/** A run of rows under one heading; `group` is null where the palette shows no headings. */
export interface PaletteSection {
	group: PaletteGroup | null;
	rows: PaletteRow[];
}

/**
 * `rows` under their headings: only an empty palette at its start is grouped — a typed query is
 * one ranked list, and a second step lists people alone.
 */
export function paletteSections(
	rows: PaletteRow[],
	query: string,
	step: PaletteStep = 'start'
): PaletteSection[] {
	if (query.trim() !== '' || step !== 'start') return rows.length ? [{ group: null, rows }] : [];
	const sections: PaletteSection[] = [];
	for (const row of rows) {
		const group = row.kind === 'person' ? 'people' : (GROUP_OF_ACTION.get(row.id) ?? null);
		const last = sections.at(-1);
		if (last && last.group === group) last.rows.push(row);
		else sections.push({ group, rows: [row] });
	}
	return sections;
}

/** The household's lists: where a phone's Home field leads before a name is typed. */
const FINDER_LIST_IDS: readonly string[] = ['gift-ideas', 'all-todos', 'all-plans', 'on-this-day'];

/** The rows for a query, in the order they are shown. */
export function paletteRows(
	query: string,
	people: PalettePerson[],
	labels: PaletteLabels,
	/** What the namesake line falls back on, by person (docs/dev/02 §2.2.3). */
	contexts: ReadonlyMap<string, PersonContext> = new Map(),
	step: PaletteStep = 'start'
): PaletteRow[] {
	const q = query.trim();
	if (step !== 'start') {
		// Only whom it is for: a name nobody matches has no form to land on.
		const pathOf = PERSON_STEP_PATH[step];
		return personSearchRows(q, people, labels.searchEverything, contexts, {
			listAllWhenEmpty: true
		})
			.filter((row) => row.kind === 'person')
			.map((row) => ({ ...row, href: pathOf(row.id) }));
	}

	const rows: PaletteRow[] = [];
	for (const action of ACTIONS) {
		const label = labels[action.label];
		if (q !== '' && !foldAction(label).includes(foldAction(q))) continue;
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
 * The rows of the home screen's search field: the household's lists while it is empty
 * (docs/dev/02 §2.22.1), the people search once something is typed.
 */
export function personFinderRows(
	query: string,
	people: PalettePerson[],
	labels: PaletteLabels,
	contexts: ReadonlyMap<string, PersonContext> = new Map()
): FinderRow[] {
	if (query.trim() !== '') {
		return personSearchRows(query, people, labels.searchEverything, contexts);
	}
	return paletteRows('', [], labels).filter(
		(row): row is FinderRow => row.kind === 'action' && FINDER_LIST_IDS.includes(row.id)
	);
}

/**
 * The rows of a search for people alone — the home screen's search field (docs/dev/02 §2.22.1):
 * the people whose name matches, then a way into full search. The palette adds its actions
 * on top; the home field has none (see `personFinderRows`).
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
