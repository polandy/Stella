import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { AccountRepository } from '../auth/accounts';
import type { Clock } from '../clock';
import { createDrizzleContactRepository } from '../db/contact-repository';
import { createDrizzlePeopleStampReads } from '../db/people-stamp-reads';
import { createDrizzlePersonContextReads } from '../db/person-context-reads';
import type * as schema from '../db/schema';
import { createDrizzleSurnameDismissalRepository } from '../db/suggestion-dismissal-repository';
import { createDrizzleSurnameFacts } from '../db/surname-facts';
import type {
	ContactDeps,
	ContactRepository,
	DeleteContactDeps
} from '../domain/contacts/contacts';
import type {
	LastNameDeps,
	SurnameDismissalDeps,
	SurnameReviewDeps
} from '../domain/contacts/last-names';
import type { NameDeps, NameRepository } from '../domain/contacts/name-parts';
import type { PeopleStampDeps } from '../domain/contacts/people-stamp';
import type { PersonContextDeps } from '../domain/contacts/person-context';
import type { NameCandidateSource, SuggestionDeps } from '../domain/contacts/suggestions';
import type { SelfContactDeps } from '../domain/household/self-contact';
import type { NamesakeContextDeps } from '../domain/mentions/namesake-context';
import type { IdGenerator } from '../id';

/*
 * The `people` bounded context of the composition root (docs/08 §8.3): the contacts
 * themselves — creating, naming and deleting them, their last names and the surnames Stella
 * proposes, what tells namesakes apart, the shell's people stamp, which contact a member is,
 * and quick-add's suggestions. Built once per process by `createServices`; the edge reads it
 * off `locals.services.people`.
 *
 * A repository an edge — or a context not grouped yet — reads directly sits under its plural
 * noun (`contacts`); everything else is a use-case's `deps`, named after its type
 * (`contactDeps` is a `ContactDeps`).
 */
export interface PeopleServices {
	/** The one contact repository: every use-case below, and other contexts, read this one. */
	contacts: ContactRepository & NameCandidateSource & NameRepository;
	contactDeps: ContactDeps;
	deleteContactDeps: DeleteContactDeps;
	nameDeps: NameDeps;
	lastNameDeps: LastNameDeps;
	surnameReviewDeps: SurnameReviewDeps;
	surnameDismissalDeps: SurnameDismissalDeps;
	personContextDeps: PersonContextDeps;
	/** What a refused `@Thomas` names each Thomas by, a namesake with nothing typed included. */
	namesakeContextDeps: NamesakeContextDeps;
	peopleStampDeps: PeopleStampDeps;
	selfContactDeps: SelfContactDeps;
	suggestionDeps: SuggestionDeps;
}

export interface PeopleWiring {
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
	/** The auth context's repository: which contact a member is lives on their account. */
	accounts: AccountRepository;
	/** The kinship a surname proposal follows; the relationships context owns the repository. */
	relationships: SurnameReviewDeps['relationships'];
	/** Where a deleted person's photo bytes are unlinked; the media context owns the store. */
	media: DeleteContactDeps['media'];
}

export function createPeopleServices({
	db,
	clock,
	ids,
	accounts,
	relationships,
	media
}: PeopleWiring): PeopleServices {
	const contacts = createDrizzleContactRepository(db);
	const surnameDismissals = createDrizzleSurnameDismissalRepository(db);
	const contactDeps: ContactDeps = { contacts, ids, clock };
	const nameDeps: NameDeps = { names: contacts, clock, ids };
	const personContextDeps: PersonContextDeps = {
		contextReads: createDrizzlePersonContextReads(db)
	};

	return {
		contacts,
		contactDeps,
		deleteContactDeps: { ...contactDeps, media },
		nameDeps,
		lastNameDeps: nameDeps,
		surnameReviewDeps: {
			surnames: createDrizzleSurnameFacts(db),
			relationships,
			surnameDismissals
		},
		surnameDismissalDeps: { names: contacts, surnameDismissals, ids, clock },
		personContextDeps,
		namesakeContextDeps: {
			...personContextDeps,
			selfContactOf: async (userId) => (await accounts.findById(userId))?.selfContactId ?? null,
			clock
		},
		peopleStampDeps: { stamps: createDrizzlePeopleStampReads(db) },
		selfContactDeps: { contacts, accounts },
		suggestionDeps: { candidates: contacts }
	};
}
