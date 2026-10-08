import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { createDrizzleInteractionRepository } from '../db/interaction-repository';
import { createDrizzleJournalRepository } from '../db/journal-repository';
import type * as schema from '../db/schema';
import type { InteractionDeps, InteractionRepository } from '../domain/interactions/interactions';
import type { JournalDeps, JournalRepository } from '../domain/journal/journal';
import type { CaptureMomentDeps } from '../domain/moments/moments';
import type { StoryDeps } from '../domain/story/story';
import type { IdGenerator } from '../id';

/*
 * The `story` bounded context of the composition root (docs/08 §8.3): what happened with a
 * person — journal entries and the moments that write them, logged touchpoints, and the story
 * timeline that shows both. Built once per process by `createServices`; the edge reads it off
 * `locals.services.story`.
 *
 * A repository an edge — or the command handler table — reads directly sits under its noun
 * (`journal`, `interactions`); everything else is a use-case's `deps`, named after its type
 * (`journalDeps` is a `JournalDeps`).
 */
export interface StoryServices {
	/** The one journal repository: every journal use-case, capturing and the timeline read it. */
	journal: JournalRepository;
	/** The one interaction repository: logging, removing and the timeline read it. */
	interactions: InteractionRepository;
	journalDeps: JournalDeps;
	interactionDeps: InteractionDeps;
	/** Capturing a moment writes a journal entry, creating anyone it names on the way. */
	captureMomentDeps: CaptureMomentDeps;
	/** The timeline only reads, so it needs no clock or ids. */
	storyDeps: StoryDeps;
}

export interface StoryWiring {
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
	/** Whom a moment names, and whom it creates; the people context owns the repository. */
	contacts: CaptureMomentDeps['contacts'];
	/** Whom a moment's handles can name; the people context owns the read model. */
	directory: CaptureMomentDeps['directory'];
	/** Where a deleted entry's photo bytes are unlinked; the media context owns the store. */
	media: JournalDeps['media'];
	/** The given and received gifts the story shows; the gifts context owns the repository. */
	gifts: StoryDeps['gifts'];
}

export function createStoryServices({
	db,
	clock,
	ids,
	contacts,
	directory,
	media,
	gifts
}: StoryWiring): StoryServices {
	const journal = createDrizzleJournalRepository(db);
	const interactions = createDrizzleInteractionRepository(db);

	return {
		journal,
		interactions,
		journalDeps: { journal, media, ids, clock },
		interactionDeps: { interactions, ids, clock },
		captureMomentDeps: { contacts, directory, journal, ids, clock },
		storyDeps: { journal, interactions, gifts }
	};
}
