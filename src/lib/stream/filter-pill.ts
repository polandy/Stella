import type { StreamFilter, StreamKind } from './filter';

/*
 * What Home's *Filter* pill says on a phone (docs/02 §2.22.2, docs/05 §5.5), where the What and
 * Who chip rows fold into one pill and a sheet. Pure, so the count and the highlight are decided
 * once and tested without a browser; the component only translates what it is handed.
 */

/** One axis the stream is narrowed on, in the order the sheet lists the groups. */
export type NarrowedAxis = { axis: 'kind'; kind: StreamKind } | { axis: 'member'; memberId: string };

/** The pill's state. */
export interface FilterPill {
	/** How many axes are narrowed — the number on the pill, absent at zero. */
	count: number;
	/** Whether the pill stands out, so a narrowed stream is never read as a quiet household. */
	highlighted: boolean;
	/** What the stream is narrowed to, for the short summary beside the pill. */
	narrowedTo: NarrowedAxis[];
}

/** The pill for `filter`. */
export function filterPill(filter: StreamFilter): FilterPill {
	const narrowedTo: NarrowedAxis[] = [];
	if (filter.kind !== null) narrowedTo.push({ axis: 'kind', kind: filter.kind });
	if (filter.memberId !== null) narrowedTo.push({ axis: 'member', memberId: filter.memberId });
	return { count: narrowedTo.length, highlighted: narrowedTo.length > 0, narrowedTo };
}
