import { estimateFromAge } from '../dates/field';
import { partialDateOfDay, type PartialDate } from '../dates/partial-date';
import type { ParentEdge, Pair } from '../kinship/kinship';
import { quickDays } from '../when/quick-picks';
import { whenOutlook, type WhenOutlook } from '../when/resolve';
import type { When } from '../when/when';
import { GIFT_GROUP_MAX_RECIPIENTS, planGiftGroup, type RecipientProblem } from './group-plan';

/* The form that notes one idea for several people (docs/dev/02 §2.25.11): who, and what each gets. */

/** The form for several, opened from one person: ticked, and the source of its shortcuts. */
export function giftGroupPath(contactId: string): string {
	return `/gifts/several?for=${encodeURIComponent(contactId)}`;
}

/** A birth date as a person list carries it, without its precision: the shape says it. */
export function storedBirth(value: string | null): PartialDate | null {
	if (value === null) return null;
	if (/^\d{4}$/.test(value)) return { value, precision: 'year' };
	return partialDateOfDay(value);
}

/** A set of people one tap ticks; never stored (F7). */
export interface GroupShortcut {
	kind: 'children' | 'siblings' | 'home' | 'circle';
	/** Whose children or siblings, the home's label or the circle's name. */
	name: string;
	ids: string[];
}

export interface ShortcutSources {
	anchor: { id: string; name: string };
	/** The visible family links, and a name for every person in them. */
	parentEdges: readonly ParentEdge[];
	siblingEdges: readonly Pair[];
	nameOf: (id: string) => string | undefined;
	/** The anchor's homes and circles, each with everyone in it the viewer may see. */
	homes: readonly { name: string; ids: readonly string[] }[];
	circles: readonly { name: string; ids: readonly string[] }[];
}

const childrenOf = (edges: readonly ParentEdge[], id: string) =>
	edges.filter((e) => e.parentId === id).map((e) => e.childId);

/**
 * The anchor's children, the children of each of their parents, their siblings, their homes and
 * circles — each once, none empty, none of only the anchor, none past the most one idea is for.
 */
export function groupShortcuts(from: ShortcutSources): GroupShortcut[] {
	const { anchor, parentEdges } = from;
	const parents = parentEdges.filter((e) => e.childId === anchor.id).map((e) => e.parentId);
	const siblings = [
		...from.siblingEdges.flatMap((p) =>
			p.a === anchor.id ? [p.b] : p.b === anchor.id ? [p.a] : []
		),
		...parents.flatMap((parent) => childrenOf(parentEdges, parent))
	].filter((id) => id !== anchor.id);
	const candidates: GroupShortcut[] = [
		{ kind: 'children', name: anchor.name, ids: childrenOf(parentEdges, anchor.id) },
		...parents.map((parent) => ({
			kind: 'children' as const,
			name: from.nameOf(parent) ?? '',
			ids: childrenOf(parentEdges, parent)
		})),
		{ kind: 'siblings', name: anchor.name, ids: siblings },
		...from.homes.map((home) => ({ kind: 'home' as const, name: home.name, ids: [...home.ids] })),
		...from.circles.map((c) => ({ kind: 'circle' as const, name: c.name, ids: [...c.ids] }))
	];
	const seen = new Set<string>();
	return candidates.flatMap((shortcut) => {
		const ids = [...new Set(shortcut.ids)];
		const key = [...ids].sort().join(' ');
		const onlyAnchor = ids.length === 1 && ids[0] === anchor.id;
		if (ids.length === 0 || onlyAnchor || ids.length > GIFT_GROUP_MAX_RECIPIENTS || seen.has(key))
			return [];
		seen.add(key);
		return [{ ...shortcut, ids }];
	});
}

/** Whether every one of a shortcut's people is ticked — its chip reads as pressed. */
export function shortcutPressed(shortcut: GroupShortcut, ticked: ReadonlySet<string>): boolean {
	return shortcut.ids.every((id) => ticked.has(id));
}

/** One person on the form, as the form holds them. */
export interface GroupFormRow {
	contactId: string;
	ticked: boolean;
	/** A when of their own, chosen *instead* (F4); absent: the shared one. */
	own?: When | null;
	/** An age typed for someone with no birth date on record (D5). */
	age?: string;
}

/** What may stand in for a when that does not fit one person. */
export interface InsteadOffer {
	pick: 'birthday' | 'christmas' | 'now';
	when: When | null;
}

/** How a grey row can be helped: an age typed, a birth date entered on the card, or a when instead. */
export type RowFix =
	{ kind: 'estimate' } | { kind: 'birthYear' } | { kind: 'instead'; offers: InsteadOffer[] };

export interface PreviewRow {
	contactId: string;
	outlook: WhenOutlook;
	/** Ticked and fitting: the idea is noted for them. */
	chosen: boolean;
	/** Why the when does not fit them; null when it does. */
	problem: RecipientProblem | null;
	fix: RowFix | null;
	own: boolean;
	/** The birth year an age typed for them stands for. */
	estimate: string | null;
}

function offersFor(
	problem: RecipientProblem,
	birth: PartialDate | null,
	today: string
): RowFix | null {
	const now: InsteadOffer = { pick: 'now', when: null };
	const day = (pick: 'birthday' | 'christmas') =>
		quickDays([pick], birth, today)
			.slice(0, 1)
			.map(({ on }): InsteadOffer => ({ pick, when: { kind: 'on_date', on } }));
	if (problem === 'birthdayPassed') return { kind: 'instead', offers: [...day('birthday'), now] };
	if (problem === 'christmasPassed') return { kind: 'instead', offers: [...day('christmas'), now] };
	return null;
}

/** Soonest first, *now* before any day and *later* after them, the grey ones last (D3). */
function rank(row: PreviewRow): string {
	if (row.problem !== null) return '3';
	if (row.outlook.kind === 'due') return `1${row.outlook.on}`;
	return row.outlook.kind === 'later' ? '2' : '0';
}

/** What the shared when comes to for each person on the form, in the order the preview lists them. */
export function previewRows(
	when: When | null,
	rows: readonly GroupFormRow[],
	birthOf: (id: string) => PartialDate | null,
	today: string
): PreviewRow[] {
	const previews = rows.map((row): PreviewRow => {
		const recorded = birthOf(row.contactId);
		const estimate =
			recorded === null && row.age !== undefined ? estimateFromAge(row.age, today) || null : null;
		const birth = estimate === null ? recorded : { value: estimate, precision: 'age' as const };
		const [plan] = planGiftGroup(when, [{ contactId: row.contactId, birth, when: row.own }], today);
		const asked = row.own !== undefined ? row.own : when;
		const problem = plan.ok ? null : plan.problem;
		const fix =
			problem === 'needsBirthYear'
				? { kind: recorded === null ? ('estimate' as const) : ('birthYear' as const) }
				: problem === null
					? null
					: offersFor(problem, birth, today);
		return {
			contactId: row.contactId,
			outlook: whenOutlook(asked, birth, today),
			chosen: plan.ok && row.ticked,
			problem,
			fix,
			own: row.own !== undefined,
			estimate
		};
	});
	return previews
		.map((row, index) => ({ row, index }))
		.sort((a, b) => rank(a.row).localeCompare(rank(b.row)) || a.index - b.index)
		.map(({ row }) => row);
}

/** Why someone is left out, as the footer says it. */
export type MissingReason = 'needsBirthYear' | 'tooOld' | 'other';

export interface GroupSummary {
	chosen: number;
	/** Everyone the when does not fit, with why — unticked people are not counted. */
	missing: { contactId: string; reason: MissingReason }[];
}

export function groupSummary(rows: readonly PreviewRow[]): GroupSummary {
	return {
		chosen: rows.filter((row) => row.chosen).length,
		missing: rows.flatMap((row) =>
			row.problem === null
				? []
				: [
						{
							contactId: row.contactId,
							reason:
								row.problem === 'needsBirthYear'
									? ('needsBirthYear' as const)
									: row.problem === 'birthdayPassed' || row.problem === 'christmasPassed'
										? ('tooOld' as const)
										: ('other' as const)
						}
					]
		)
	};
}

/** One person as the command carries them. */
export interface GroupRecipientField {
	contactId: string;
	when?: When | null;
	birthYear?: string;
}

/** The chosen people, as the form's hidden `recipients` field carries them to the command. */
export function recipientsField(
	rows: readonly PreviewRow[],
	formRows: readonly GroupFormRow[]
): GroupRecipientField[] {
	const byId = new Map(formRows.map((row) => [row.contactId, row]));
	return rows
		.filter((row) => row.chosen)
		.map((row) => {
			const own = byId.get(row.contactId)?.own;
			return {
				contactId: row.contactId,
				...(own !== undefined ? { when: own } : {}),
				...(row.estimate !== null ? { birthYear: row.estimate } : {})
			};
		});
}

/** The occasion a shared when names: a birthday, Christmas, or none. */
export function groupOccasion(when: When | null): string | null {
	if (when?.kind === 'christmas_at_age') return 'christmas';
	if (when?.kind === 'at_age') return 'birthday';
	return null;
}
