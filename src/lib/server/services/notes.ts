import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { createDrizzleMentionedInRepository } from '../db/mentioned-in-repository';
import { createDrizzleNoteRepository } from '../db/note-repository';
import type * as schema from '../db/schema';
import type { MentionedInDeps, MentionedInRepository } from '../domain/mentions/mentioned-in';
import type { NoteDeps, NoteRepository } from '../domain/notes/notes';
import type { IdGenerator } from '../id';

/*
 * The `notes` bounded context of the composition root (docs/08 §8.3): the notes kept on a
 * person, and the passive "Mentioned in" list that reads them — with journal entries — back on
 * whom they name. Built once per process by `createServices`; the edge reads it off
 * `locals.services.notes`.
 *
 * A repository an edge reads directly sits under its noun (`notes`, `mentionedIn`); everything
 * else is a use-case's `deps`, named after its type (`noteDeps` is a `NoteDeps`).
 */
export interface NoteServices {
	/** The one note repository: writing, listing and linking mentions read it. */
	notes: NoteRepository;
	/** The one "Mentioned in" read, over notes and journal entries alike. */
	mentionedIn: MentionedInRepository;
	noteDeps: NoteDeps;
	/** The passive list only reads, so it needs no clock or ids. */
	mentionedInDeps: MentionedInDeps;
}

export interface NoteWiring {
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
}

export function createNoteServices({ db, clock, ids }: NoteWiring): NoteServices {
	const notes = createDrizzleNoteRepository(db);
	const mentionedIn = createDrizzleMentionedInRepository(db);

	return {
		notes,
		mentionedIn,
		noteDeps: { notes, ids, clock },
		mentionedInDeps: { mentions: mentionedIn }
	};
}
