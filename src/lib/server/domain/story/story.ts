import type { Viewer } from '../../access/visibility';
import type { Interaction, InteractionRepository } from '../interactions/interactions';
import type { JournalEntry, JournalRepository } from '../journal/journal';

/*
 * The story of a person (docs/02 §2.23): the journal someone wrote about them and the
 * touchpoints someone had with them, read as one thing in one order — because that is how it
 * happened. Two lists side by side made the reader do the merging.
 *
 * The two sources are stored and paginated separately, so `mergeStory` is a pure merge over one
 * page of each and `listStoryPage` is the thin part that fetches them. Keeping the merge pure is
 * what makes the cursor rules — the ones that decide whether paging repeats or drops an item —
 * testable without a database.
 */

/** When something happened, and when it was written down. Both sources order by this pair. */
export interface StoryPoint {
	/** The day it is about, ISO `YYYY-MM-DD`. */
	day: string;
	recordedAt: number;
}

/** One thing that happened with a person. */
export type StoryItem =
	| ({ kind: 'journal'; entry: JournalEntry } & StoryPoint)
	| ({ kind: 'interaction'; interaction: Interaction } & StoryPoint);

/**
 * Where one source picks up: at the top, strictly older than a point, or nowhere because it
 * has nothing left. Three states, not two — a source can contribute nothing to a page and
 * still have rows waiting, and collapsing that onto the same value as "finished" silently
 * drops the rest of it.
 */
export type StoryResume = StoryPoint | 'top' | 'finished';

/** One page of one source, as the repository handed it back. */
export interface StorySource<T> {
	items: T[];
	/** True when the repository had nothing left after these — it returned short. */
	exhausted: boolean;
	/** Where this page was read from, so a page that shows none of it can resume there. */
	resumeFrom: StoryResume;
}

/** Where each source resumes; a cursor with both halves finished is not returned at all. */
export interface StoryCursor {
	journal: StoryResume;
	interactions: StoryResume;
}

export interface StoryPage {
	items: StoryItem[];
	/** Cursor for the next, older page; `null` once the whole story has been read. */
	nextCursor: StoryCursor | null;
}

export interface StoryDeps {
	journal: Pick<JournalRepository, 'listPageForContactVisibleTo'>;
	interactions: Pick<InteractionRepository, 'listPageForContactVisibleTo'>;
}

/** Most recent first: later day wins, then later recording, then a fixed order for a dead heat. */
function newestFirst(a: StoryItem, b: StoryItem): number {
	if (a.day !== b.day) return a.day < b.day ? 1 : -1;
	if (a.recordedAt !== b.recordedAt) return a.recordedAt - b.recordedAt > 0 ? -1 : 1;
	// Same day, same instant: order by kind so a page boundary always falls in the same place.
	return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
}

/** Where a source picks up again, given how much of its page was shown. */
function resume<T>(source: StorySource<T>, shown: StoryItem[]): StoryResume {
	const last = shown.at(-1);
	if (last === undefined) {
		// Nothing from this source made the page. It is finished only if it also had nothing to
		// give; otherwise the next page has to read it again from exactly the same place.
		return source.exhausted && source.items.length === 0 ? 'finished' : source.resumeFrom;
	}
	const allShown = shown.length === source.items.length;
	if (allShown && source.exhausted) return 'finished';
	return { day: last.day, recordedAt: last.recordedAt };
}

/** Merge one page of each source into one page of story, newest first. */
export function mergeStory(input: {
	journal: StorySource<JournalEntry>;
	interactions: StorySource<Interaction>;
	limit: number;
}): StoryPage {
	const journalItems: StoryItem[] = input.journal.items.map((entry) => ({
		kind: 'journal',
		entry,
		day: entry.entryDate,
		recordedAt: entry.createdAt
	}));
	const interactionItems: StoryItem[] = input.interactions.items.map((interaction) => ({
		kind: 'interaction',
		interaction,
		day: interaction.happenedAt,
		recordedAt: interaction.createdAt
	}));

	const items = [...journalItems, ...interactionItems]
		.sort(newestFirst)
		.slice(0, Math.max(0, Math.trunc(input.limit)));

	const journal = resume(
		input.journal,
		items.filter((i) => i.kind === 'journal')
	);
	const interactions = resume(
		input.interactions,
		items.filter((i) => i.kind === 'interaction')
	);

	return {
		items,
		nextCursor:
			journal === 'finished' && interactions === 'finished' ? null : { journal, interactions }
	};
}

/**
 * One page of a person's story, newest first. Pass the previous page's `nextCursor` to read
 * further back; a source marked `'finished'` is not queried again.
 *
 * Each source is asked for a whole page of its own, because one of them may fill the page
 * alone, plus one row over that to learn whether anything is left behind it.
 */
export async function listStoryPage(
	deps: StoryDeps,
	viewer: Viewer,
	contactId: string,
	opts: { limit: number; cursor?: StoryCursor }
): Promise<StoryPage> {
	const limit = Math.max(1, Math.min(Math.trunc(opts.limit), 100));
	const perSource = limit;
	const journalFrom: StoryResume = opts.cursor?.journal ?? 'top';
	const interactionsFrom: StoryResume = opts.cursor?.interactions ?? 'top';

	// A finished source is never read again.
	const wantJournal = journalFrom !== 'finished';
	const wantInteractions = interactionsFrom !== 'finished';

	const [journalRows, interactionRows] = await Promise.all([
		wantJournal
			? deps.journal.listPageForContactVisibleTo(viewer, contactId, {
					limit: perSource + 1,
					before:
						journalFrom === 'top'
							? undefined
							: { entryDate: journalFrom.day, createdAt: journalFrom.recordedAt }
				})
			: Promise.resolve([]),
		wantInteractions
			? deps.interactions.listPageForContactVisibleTo(viewer, contactId, {
					limit: perSource + 1,
					before:
						interactionsFrom === 'top'
							? undefined
							: { happenedAt: interactionsFrom.day, createdAt: interactionsFrom.recordedAt }
				})
			: Promise.resolve([])
	]);

	// One row over the asked-for page is how each source says "there is more behind me".
	const journalHasMore = journalRows.length > perSource;
	const interactionsHaveMore = interactionRows.length > perSource;

	return mergeStory({
		journal: {
			items: journalHasMore ? journalRows.slice(0, perSource) : journalRows,
			exhausted: !journalHasMore,
			resumeFrom: journalFrom
		},
		interactions: {
			items: interactionsHaveMore ? interactionRows.slice(0, perSource) : interactionRows,
			exhausted: !interactionsHaveMore,
			resumeFrom: interactionsFrom
		},
		limit
	});
}
