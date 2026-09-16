import { describe, expect, it } from 'bun:test';
import {
	CLAIMS_PER_GROUP,
	DECLINED_INLINE_MAX,
	PEOPLE_PER_PAGE,
	declinedFitsInline,
	declinedKey,
	foldGroup,
	orderedDeclined,
	orderedGroups,
	pageOf,
	reviewPage,
	subjectKey
} from './paging';
import type { NamedClaim } from './grouping';
import type { Relation } from './types';

/*
 * Paging and folding a household-wide review
 * (docs/concepts/relationship-review-at-scale.html, docs/04 §4.9).
 *
 * The engine computes everything — that is the no-cap decision — so the screen is what has to
 * stay finite. Nothing here drops a claim: the page limits what is *rendered*, and every total
 * is taken before the slice. These are pure functions precisely so that property can be
 * asserted without a database, a viewer or a browser.
 */

const claim = (relation: Relation, fromId: string, toId: string, fromName: string, toName: string): NamedClaim => ({
	relation,
	fromId,
	toId,
	fromName,
	toName
});

/** `count` parent claims about `name`, each from a different parent, so none is a duplicate. */
function claimsAbout(id: string, name: string, count: number): NamedClaim[] {
	return Array.from({ length: count }, (_, n) =>
		claim('parent', `${id}-parent-${n}`, id, `Parent ${n} of ${name}`, name)
	);
}

/** A household of `people` people, one claim each, named so their sort order is obvious. */
function household(people: number): NamedClaim[] {
	return Array.from({ length: people }, (_, n) => {
		const id = `p${String(n).padStart(3, '0')}`;
		return claimsAbout(id, `Person ${String(n).padStart(3, '0')}`, 1)[0]!;
	});
}

describe('pageOf', () => {
	const keyOf = (n: number) => String(n).padStart(3, '0');
	const items = [1, 2, 3, 4, 5, 6, 7];

	it('starts at the beginning with no cursor, and offers no way back from there', () => {
		const page = pageOf(items, keyOf, 3);
		expect(page.items).toEqual([1, 2, 3]);
		expect(page.from).toBe(1);
		expect(page.to).toBe(3);
		expect(page.total).toBe(7);
		expect(page.previousCursor).toBeNull();
		expect(page.nextCursor).toBe('003');
	});

	it('walks forward and back over the same boundary', () => {
		const first = pageOf(items, keyOf, 3);
		const second = pageOf(items, keyOf, 3, { after: first.nextCursor });
		expect(second.items).toEqual([4, 5, 6]);
		expect(second.from).toBe(4);

		const back = pageOf(items, keyOf, 3, { before: second.previousCursor });
		expect(back.items).toEqual(first.items);
	});

	it('stops offering a next page on the last one', () => {
		const last = pageOf(items, keyOf, 3, { after: '006' });
		expect(last.items).toEqual([7]);
		expect(last.nextCursor).toBeNull();
		expect(last.previousCursor).toBe('007');
	});

	/*
	 * The reason the cursor is a key and not an offset. Between rendering a page and following
	 * its *next* link, the household answers the claims about items 2 and 3, so they leave the
	 * list. An offset of 3 would now start at 6 and silently skip 4 and 5. Anchored to the key
	 * of the last row that *was* shown, the next page still begins at 4.
	 */
	it('skips nothing when rows vanish between two pages', () => {
		const shown = pageOf(items, keyOf, 3);
		const answeredAway = items.filter((n) => n !== 2 && n !== 3);
		expect(pageOf(answeredAway, keyOf, 3, { after: shown.nextCursor }).items).toEqual([4, 5, 6]);
	});

	/* A cursor pointing past everything that is left lands on the last page, never on nothing. */
	it('lands on the last page when the cursor has outlived the list', () => {
		expect(pageOf(items, keyOf, 3, { after: '999' }).items).toEqual([5, 6, 7]);
	});

	it('reports an empty list as empty rather than as page one of one', () => {
		const page = pageOf([], keyOf, 3);
		expect(page.items).toEqual([]);
		expect(page.total).toBe(0);
		expect(page.from).toBe(0);
		expect(page.to).toBe(0);
		expect(page.nextCursor).toBeNull();
		expect(page.previousCursor).toBeNull();
	});

	/*
	 * The property that makes the pager trustworthy: walking it from the first page to the last
	 * visits every item exactly once, in order. This is the guard against the whole class of
	 * off-by-one cursor bugs, where an item is shown twice or never.
	 */
	it('walks every item exactly once, whatever the page size', () => {
		for (const size of [1, 2, 3, 5, 7, 8]) {
			const seen: number[] = [];
			let cursor: string | null = null;
			// Bounded so a broken cursor fails the assertion instead of hanging the suite.
			for (let guard = 0; guard <= items.length; guard += 1) {
				const page: ReturnType<typeof pageOf<number>> = pageOf(items, keyOf, size, { after: cursor });
				seen.push(...page.items);
				if (page.nextCursor === null) break;
				cursor = page.nextCursor;
			}
			expect(seen).toEqual(items);
		}
	});
});

describe('foldGroup', () => {
	const group = {
		subjectId: 'erika',
		subjectName: 'Erika Roth',
		suggestions: claimsAbout('erika', 'Erika Roth', 39)
	};

	it('shows the first few and counts the rest honestly', () => {
		const folded = foldGroup(group);
		expect(folded.suggestions).toHaveLength(CLAIMS_PER_GROUP);
		expect(folded.totalSuggestions).toBe(39);
		expect(folded.suggestions).toEqual(group.suggestions.slice(0, CLAIMS_PER_GROUP));
	});

	/* A group that fits is not folded — no "0 more" row, and nothing to click through to. */
	it('leaves a group of exactly the limit alone', () => {
		const exact = { ...group, suggestions: claimsAbout('erika', 'Erika Roth', CLAIMS_PER_GROUP) };
		const folded = foldGroup(exact);
		expect(folded.suggestions).toHaveLength(CLAIMS_PER_GROUP);
		expect(folded.totalSuggestions).toBe(CLAIMS_PER_GROUP);
	});
});

describe('orderedGroups', () => {
	/*
	 * Paging needs a total order that does not move between two requests, and the comparison
	 * that sorts must be the same one the cursor is compared with — a locale-aware sort with a
	 * code-unit cursor comparison would page correctly on one machine and skip rows on another.
	 */
	it('orders by name and breaks every tie with the id', () => {
		const groups = orderedGroups([
			...claimsAbout('b', 'Bea Roth', 1),
			...claimsAbout('a2', 'Ada Roth', 1),
			...claimsAbout('a1', 'Ada Roth', 1)
		]);
		expect(groups.map((g) => g.subjectId)).toEqual(['a1', 'a2', 'b']);
		expect(groups.map(subjectKey)).toEqual([...groups.map(subjectKey)].sort());
	});

	/*
	 * The key separator is a character an id cannot contain, so two people keep distinct keys
	 * even when one of them has it in their name — which is what lets the cursor travel in a
	 * query string unencoded.
	 */
	it('keeps keys distinct when a name contains the separator', () => {
		const groups = orderedGroups([
			...claimsAbout('01J', 'Ada|Roth', 1),
			...claimsAbout('01K', 'Ada', 1)
		]);
		const keys = groups.map(subjectKey);
		expect(new Set(keys).size).toBe(2);
		expect(keys.every((key) => key === encodeURIComponent(key).replace(/%7C/g, '|'))).toBe(true);
	});
});

describe('reviewPage', () => {
	it('renders one page while counting the whole household', () => {
		const claims = [...household(30), ...claimsAbout('heavy', 'Zora Heavy', 20)];
		const page = reviewPage(claims);

		expect(page.groups).toHaveLength(PEOPLE_PER_PAGE);
		expect(page.people).toBe(31);
		expect(page.openClaims).toBe(50);
		expect(page.matched).toBe(31);
		expect(page.from).toBe(1);
		expect(page.to).toBe(PEOPLE_PER_PAGE);
	});

	/*
	 * The one way this design fails: a count that describes the page rather than the household.
	 * Deleting the slice-before-count order here reddens this case, which is why the totals are
	 * asserted against a household deliberately larger than a page.
	 */
	it('never lets a page shrink a total', () => {
		const page = reviewPage(household(PEOPLE_PER_PAGE * 3));
		expect(page.groups.length).toBeLessThan(page.people);
		expect(page.people).toBe(PEOPLE_PER_PAGE * 3);
		expect(page.openClaims).toBe(PEOPLE_PER_PAGE * 3);
	});

	it('folds an oversized group and says how many it is holding back', () => {
		const page = reviewPage(claimsAbout('erika', 'Erika Roth', 39));
		expect(page.groups[0]!.suggestions).toHaveLength(CLAIMS_PER_GROUP);
		expect(page.groups[0]!.totalSuggestions).toBe(39);
		// Folding is not dropping: the household count still knows about all thirty-nine.
		expect(page.openClaims).toBe(39);
	});

	/*
	 * A search narrows the pager, not the household. The header says how much work there is in
	 * total; the pager says where the reader is inside what they asked for. Both numbers appear
	 * on the same screen, so a case that pins them apart is the only thing keeping them apart.
	 */
	it('narrows the pager with a search and leaves the household totals alone', () => {
		const claims = [...household(30), ...claimsAbout('nadja', 'Nadja Ammann', 3)];
		const page = reviewPage(claims, {}, { query: 'ammann' });

		expect(page.groups.map((g) => g.subjectName)).toEqual(['Nadja Ammann']);
		expect(page.matched).toBe(1);
		expect(page.people).toBe(31);
		expect(page.openClaims).toBe(33);
	});

	it('matches a search regardless of case, and reports no match as an empty page', () => {
		const claims = claimsAbout('nadja', 'Nadja Ammann', 1);
		expect(reviewPage(claims, {}, { query: 'NADJA' }).matched).toBe(1);

		const nothing = reviewPage(claims, {}, { query: 'Brunner' });
		expect(nothing.groups).toEqual([]);
		expect(nothing.matched).toBe(0);
		// Still honest about the household behind the empty result.
		expect(nothing.people).toBe(1);
	});

	/* Walking the pager reaches every person once — the same property, through the real entry point. */
	it('reaches every person exactly once when the pager is walked', () => {
		const claims = household(PEOPLE_PER_PAGE * 2 + 3);
		const seen: string[] = [];
		let cursor: string | null = null;
		for (let guard = 0; guard <= 3; guard += 1) {
			const page: ReturnType<typeof reviewPage<NamedClaim>> = reviewPage(claims, { after: cursor });
			seen.push(...page.groups.map((g: { subjectId: string }) => g.subjectId));
			if (page.nextCursor === null) break;
			cursor = page.nextCursor;
		}
		expect(seen).toHaveLength(PEOPLE_PER_PAGE * 2 + 3);
		expect(new Set(seen).size).toBe(seen.length);
	});
});

describe('the declined log', () => {
	const declined = (fromId: string, at: number) => ({
		...claim('parent', fromId, 'lisa', 'A Parent', 'Lisa Meier'),
		dismissed: { at, by: 'andy' }
	});

	/*
	 * The log reads newest first, while a cursor compares with `<` — so the key inverts the
	 * timestamp. Sorting by the key and reading the answers newest-first have to be the same
	 * thing, or the log pages in one order and displays in another.
	 */
	it('orders the most recent answer first', () => {
		const rows = orderedDeclined([declined('a', 100), declined('c', 300), declined('b', 200)]);
		expect(rows.map((r) => r.fromId)).toEqual(['c', 'b', 'a']);
		expect(rows.map(declinedKey)).toEqual([...rows.map(declinedKey)].sort());
	});

	/* Same millisecond, two claims: the pair decides, so the order is still total. */
	it('breaks a tie on the pair rather than leaving it to chance', () => {
		const rows = orderedDeclined([declined('b', 100), declined('a', 100)]);
		expect(rows.map((r) => r.fromId)).toEqual(['a', 'b']);
	});

	/* Fixed-width, so an older answer never sorts ahead of a newer one on string length alone. */
	it('gives every answer a key of the same width', () => {
		const widths = new Set([declined('a', 1).dismissed.at, declined('a', 1_700_000_000_000).dismissed.at]
			.map((at) => declinedKey(declined('a', at)).split('|')[0]!.length));
		expect(widths.size).toBe(1);
	});
});

describe('declinedFitsInline', () => {
	/* The boundary itself stays in the drawer; one past it earns the log its own page. */
	it('keeps the log inline up to the threshold and not beyond', () => {
		expect(declinedFitsInline(0)).toBe(true);
		expect(declinedFitsInline(DECLINED_INLINE_MAX)).toBe(true);
		expect(declinedFitsInline(DECLINED_INLINE_MAX + 1)).toBe(false);
	});
});
