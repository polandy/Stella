import { RELATIONSHIP_CATEGORIES, type RelationshipCategory } from '../relationships/categories';
import { CURRENT_RELATIONSHIP_STATUS } from '../relationships/status';

/*
 * What else says who a namesake is, when nobody typed a description or where they met
 * (docs/02 §2.2.3): one of their relationships, or a circle they are in. The server reads the
 * candidates the viewer may see and ranks them here; the browser picks the line from what it
 * is sent (`tellApart`), since only it knows which other names are shared on the list.
 */

/** One link as the namesake's own end reads it: *Sibling of Sabine Keller*. */
export interface ContextTie {
	/** The type's machine key, which translates a type Stella ships with. */
	typeKey: string;
	/** Which of the type's two labels the namesake's end reads. */
	side: 'forward' | 'reverse';
	/** The label as stored, shown as it is for a household's own type. */
	label: string;
	otherId: string;
	otherName: string;
	/** The other end is the viewer's own person, which reads *Your sibling*. */
	otherIsViewer: boolean;
}

export interface ContextCircle {
	name: string;
	role: string | null;
}

/** What the second line may fall back on for one person, best first. */
export interface PersonContext {
	ties: ContextTie[];
	circle: ContextCircle | null;
}

/** A visible link of the person's, with what ranks it. */
export interface TieCandidate extends ContextTie {
	category: RelationshipCategory;
	sortOrder: number;
	status: string;
	createdAt: number;
}

/** A visible membership of the person's in a circle that is not archived. */
export interface MembershipCandidate {
	circleId: string;
	parentCircleId: string | null;
	name: string;
	role: string | null;
	startDate: string | null;
	endDate: string | null;
}

/**
 * How many links are kept per person. The browser skips a link whose other end is itself a
 * namesake (*Father of Thomas*), so one is not always enough; a few cover that without
 * sending everyone's whole network.
 */
export const TIES_KEPT = 3;

const categoryRank = (category: RelationshipCategory) => RELATIONSHIP_CATEGORIES.indexOf(category);

/** Ended once the day is past the end date, read at the precision it was written in. */
const hasEnded = (endDate: string | null, today: string) =>
	endDate !== null && endDate < today.slice(0, endDate.length);

/**
 * The ties and the circle a person's second line may name, or null when there is neither.
 * Only current links count: a former one says where someone was, not who they are.
 */
export function rankContext(
	ties: readonly TieCandidate[],
	memberships: readonly MembershipCandidate[],
	today: string
): PersonContext | null {
	const ranked = ties
		.filter((t) => t.status === CURRENT_RELATIONSHIP_STATUS)
		.toSorted(
			(a, b) =>
				categoryRank(a.category) - categoryRank(b.category) ||
				a.sortOrder - b.sortOrder ||
				a.createdAt - b.createdAt
		)
		.slice(0, TIES_KEPT)
		.map(
			({ typeKey, side, label, otherId, otherName, otherIsViewer }): ContextTie => ({
				typeKey,
				side,
				label,
				otherId,
				otherName,
				otherIsViewer
			})
		);

	const current = memberships.filter((m) => !hasEnded(m.endDate, today));
	// A circle whose sub-circle they are in too says less: *Class 9a* over *School Muri*.
	const parents = new Set(current.map((m) => m.parentCircleId));
	const [best] = current
		.filter((m) => !parents.has(m.circleId))
		.toSorted(
			(a, b) =>
				Number(b.role !== null) - Number(a.role !== null) ||
				(b.startDate ?? '').localeCompare(a.startDate ?? '') ||
				a.name.localeCompare(b.name)
		);
	const circle = best ? { name: best.name, role: best.role } : null;

	return ranked.length > 0 || circle ? { ties: ranked, circle } : null;
}
