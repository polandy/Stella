import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { createDrizzleContactFieldRepository } from '../db/contact-field-repository';
import { createDrizzleImportantDateRepository } from '../db/important-date-repository';
import type * as schema from '../db/schema';
import { createDrizzleTagListReads } from '../db/tag-list-reads';
import { createDrizzleTagRepository } from '../db/tag-repository';
import type { ContactFieldDeps } from '../domain/contact-fields/contact-fields';
import type { ContactLookup } from '../domain/contacts/contacts';
import type { ImportantDateDeps, ImportantDateRepository } from '../domain/dates/important-dates';
import type { TagListDeps } from '../domain/tags/tag-lists';
import type { TagDeps, TagRepository } from '../domain/tags/tags';
import type { IdGenerator } from '../id';

/*
 * The `records` bounded context of the composition root (docs/08 §8.3): what a person's page
 * keeps about them besides their story — contact fields, important dates and tags. Built once
 * per process by `createServices`; the edge reads it off `locals.services.records`.
 *
 * A repository an edge reads directly sits under its noun (`importantDates`, `tags`);
 * everything else is a use-case's `deps`, named after its type (`tagDeps` is a `TagDeps`).
 * A tag's writes and its lists are separate ports with an adapter each (docs/08 §8.3).
 */
export interface RecordServices {
	/** The one important date repository, also the home page's source of upcoming dates. */
	importantDates: ImportantDateRepository;
	/** The one tag repository, household-wide: naming, assigning and pruning tags. */
	tags: TagRepository;
	contactFieldDeps: ContactFieldDeps;
	importantDateDeps: ImportantDateDeps;
	tagDeps: TagDeps;
	/** The chip row, each person's tags and the people a chip filters to. */
	tagListDeps: TagListDeps;
}

export interface RecordWiring {
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
	/** The people group's lookup: removing a field or a date first checks the person is seen. */
	contacts: ContactLookup;
}

export function createRecordServices({ db, clock, ids, contacts }: RecordWiring): RecordServices {
	const contactFields = createDrizzleContactFieldRepository(db);
	const importantDates = createDrizzleImportantDateRepository(db);
	const tags = createDrizzleTagRepository(db);

	return {
		importantDates,
		tags,
		contactFieldDeps: { fields: contactFields, contacts, ids, clock },
		importantDateDeps: { dates: importantDates, contacts, ids, clock },
		tagDeps: { tags, ids, clock },
		tagListDeps: { tagLists: createDrizzleTagListReads(db) }
	};
}
