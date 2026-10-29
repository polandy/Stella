import type { KnownTag } from './picker';

/*
 * Reading a tag across the household (docs/02 §2.20.2): Home's Tags row and the line under it,
 * and the head of a tag's own page. Pure; the tags arrive scoped and counted, most used first
 * (`EntryTagReads.listVisibleTo`), and the moments scoped by the stream's read.
 */

/** Tags Home offers as chips before *All tags*. */
export const HOME_TAG_LIMIT = 8;

/**
 * How many moments a tag's page reads: all of a family's, in practice — the head counts its
 * people from the rows, so a page cut short would undercount them.
 */
export const TAG_PAGE_LIMIT = 1000;

/**
 * Home's Tags row: the most used tags, and the chosen ones too when they are not among them, so
 * the row always shows what the stream is narrowed to.
 */
export function homeTagChips(tags: readonly KnownTag[], chosen: readonly string[]): KnownTag[] {
	const top = tags.slice(0, HOME_TAG_LIMIT);
	const extra = chosen.flatMap((key) =>
		top.some((t) => t.key === key) ? [] : tags.filter((t) => t.key === key)
	);
	return [...top, ...extra];
}

/** What Home's stream is narrowed to by tags, for the line above it. */
export interface TagsNarrowing {
	/** The chosen tags as the household spells them; a key when the viewer has no moment of it. */
	names: string[];
	/** How many moments the narrowed stream holds. */
	count: number;
}

/**
 * The line over Home's stream narrowed to `keys`. One tag's count is every moment the viewer can
 * read that carries it; several tags, or a member as well, count the moments shown instead.
 */
export function tagNarrowing(
	keys: readonly string[],
	memberId: string | null,
	tags: readonly KnownTag[],
	momentsShown: number
): TagsNarrowing | null {
	if (keys.length === 0) return null;
	const known = keys.map((key) => tags.find((t) => t.key === key));
	const [only] = known;
	return {
		names: keys.map((key, i) => known[i]?.name ?? key),
		count: keys.length === 1 && memberId === null ? (only?.count ?? 0) : momentsShown
	};
}

/** One tag as the search head names it. */
export interface TagNarrowing {
	key: string;
	/** The household's spelling; the key itself when the viewer has no moment carrying it. */
	name: string;
	/** How many moments carry it. */
	count: number;
}

/** The head of a tag's page. */
export interface TagSummary {
	key: string;
	name: string;
	onlyPrivate: boolean;
	moments: number;
	/** The people those moments are on. */
	people: number;
}

/**
 * The head of the page for `key`, over the moments it shows. Null when the viewer has none: a tag
 * that does not exist and one only on someone else's private moments read the same.
 */
export function tagSummary(
	key: string,
	tags: readonly KnownTag[],
	moments: readonly { anchor: { id: string } }[]
): TagSummary | null {
	const known = tags.find((t) => t.key === key);
	if (!known || moments.length === 0) return null;
	return {
		key,
		name: known.name,
		onlyPrivate: known.onlyPrivate,
		moments: moments.length,
		people: new Set(moments.map((m) => m.anchor.id)).size
	};
}

/**
 * The head row of a search for one `#tag`, leading to the tag's page (docs/02 §2.9): the count
 * is the household's, which the search's own limit may cut short. Null when the query was no
 * tag or found nothing.
 */
export function searchTagHead(
	key: string | null,
	tags: readonly KnownTag[],
	found: number
): TagNarrowing | null {
	if (!key || found === 0) return null;
	const known = tags.find((t) => t.key === key);
	return { key, name: known?.name ?? key, count: known?.count ?? found };
}
