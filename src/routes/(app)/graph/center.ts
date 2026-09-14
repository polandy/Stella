/*
 * Which person the explorer opens on (docs/02 §2.7). Pure, so the order of preference is
 * stated once and tested without a graph or a database.
 */

/** A node of the visible graph, as far as centring is concerned. */
export interface CentrableNode {
	id: string;
	kind: string;
	/** A person's name, for the way back to their page. */
	label?: string;
}

/** Who the explorer opens on, and whether a link asked for them. */
export interface Center {
	id: string | null;
	/**
	 * True only when the centre is the one the link named. A profile links here with its own
	 * person (docs/05 §5.5), so this is also what says a way back to that page is owed — the
	 * member's own person, chosen because nothing was asked for, is not somewhere they came
	 * from.
	 */
	asked: boolean;
}

/** Who the explorer opens on, and whether a link asked for them. */
export interface Center {
	id: string | null;
	/**
	 * True only when the centre is the one the link named. A profile links here with its own
	 * person (docs/05 §5.5), so this is also what says a way back to that page is owed — the
	 * member's own person, chosen because nothing was asked for, is not somewhere they came
	 * from.
	 */
	asked: boolean;
}

/**
 * The asked-for person wins; otherwise the member's own person (docs/02 §2.1.3), which is the
 * view they almost always want; otherwise the first visible person, so the page is never
 * empty for a household that has one. Anyone the viewer cannot see is skipped rather than
 * honoured — a link may name a person this member has no business seeing.
 */
export function chooseCenter(
	nodes: readonly CentrableNode[],
	requested: string | null,
	selfContactId: string | null
): Center {
	const ids = new Set(nodes.map((node) => node.id));
	if (requested && ids.has(requested)) return { id: requested, asked: true };
	if (selfContactId && ids.has(selfContactId)) return { id: selfContactId, asked: false };
	return { id: nodes.find((node) => node.kind === 'person')?.id ?? null, asked: false };
}

/**
 * The name to offer a way back to, or `null` when none is owed. Only a person the link itself
 * asked for: a centre the route fell back to is not somewhere the reader came from, and a
 * circle has no page of its own to go back to — `/contacts/<circle>` is a 404.
 */
export function wayBackTo(nodes: readonly CentrableNode[], center: Center): string | null {
	if (!center.asked || center.id === null) return null;
	const node = nodes.find((candidate) => candidate.id === center.id);
	return node?.kind === 'person' ? (node.label ?? null) : null;
}

/**
 * The other end of a connection path a link asks to trace (`?path=`), or null.
 *
 * A person's page cannot answer "how are we connected?" itself: it holds two hops of the
 * household, and the answer usually runs further than that. So it hands the question here,
 * with both ends named (docs/05 §5.5). Anyone the viewer cannot see is refused rather than
 * traced — the same rule the centre follows — and so is the centre itself, which would trace
 * a chain of one.
 */
export function chosenPathTarget(
	nodes: readonly CentrableNode[],
	requested: string | null,
	centerId: string | null
): string | null {
	if (!requested || requested === centerId) return null;
	return nodes.some((node) => node.id === requested) ? requested : null;
}
