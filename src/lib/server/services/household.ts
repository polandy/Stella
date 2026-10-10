import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { createDrizzleAttentionRepository } from '../db/attention-repository';
import { createDrizzleMemberAccountRepository } from '../db/member-account-repository';
import { createDrizzleMemberRepository } from '../db/member-repository';
import type * as schema from '../db/schema';
import { createDrizzleSearchRepository } from '../db/search-repository';
import type { AttentionRepository } from '../domain/attention/last-touched';
import type { MemberDeps, MemberRepository } from '../domain/household/members';
import type { MemberAccountDeps } from '../domain/household/remove-member';
import type { SearchDeps, SearchRepository } from '../domain/search/search';
import type { IdGenerator } from '../id';

/*
 * The `household` bounded context of the composition root (docs/08 §8.3): the reads across
 * the whole household rather than one person — its members (and removing one), the search
 * and the attention list. Built once per process by `createServices`; the edge reads it off
 * `locals.services.household`.
 *
 * A repository an edge reads directly sits under its noun (`members`, `search`, `attention`);
 * everything else is a use-case's `deps`, named after its type (`memberDeps` is a
 * `MemberDeps`).
 */
export interface HouseholdServices {
	/** The household's members, for putting a name on what each of them wrote (docs/02 §2.23). */
	members: MemberRepository;
	/** The one search repository: the search page and the import API's people lookup. */
	search: SearchRepository;
	/** The latest day anything was recorded about each person, for the People list (§2.2). */
	attention: AttentionRepository;
	memberDeps: MemberDeps;
	/** The Members page in Settings: the accounts, and removing one (docs/02 §2.1). */
	memberAccountDeps: MemberAccountDeps;
	searchDeps: SearchDeps;
}

export interface HouseholdWiring {
	db: BunSQLiteDatabase<typeof schema>;
	ids: IdGenerator;
	clock: Clock;
}

export function createHouseholdServices({ db, ids, clock }: HouseholdWiring): HouseholdServices {
	const members = createDrizzleMemberRepository(db);
	const search = createDrizzleSearchRepository(db);
	const attention = createDrizzleAttentionRepository(db);

	return {
		members,
		search,
		attention,
		memberDeps: { members },
		memberAccountDeps: { accounts: createDrizzleMemberAccountRepository(db), ids, clock },
		searchDeps: { search }
	};
}
