import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { createDrizzleAttentionRepository } from '../db/attention-repository';
import { createDrizzleMemberRepository } from '../db/member-repository';
import type * as schema from '../db/schema';
import { createDrizzleSearchRepository } from '../db/search-repository';
import type { AttentionRepository } from '../domain/attention/last-touched';
import type { MemberDeps, MemberRepository } from '../domain/household/members';
import type { SearchDeps, SearchRepository } from '../domain/search/search';

/*
 * The `household` bounded context of the composition root (docs/08 §8.3): the reads across
 * the whole household rather than one person — its members, the search and the attention
 * list. Built once per process by `createServices`; the edge reads it off
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
	searchDeps: SearchDeps;
}

export interface HouseholdWiring {
	db: BunSQLiteDatabase<typeof schema>;
}

export function createHouseholdServices({ db }: HouseholdWiring): HouseholdServices {
	const members = createDrizzleMemberRepository(db);
	const search = createDrizzleSearchRepository(db);
	const attention = createDrizzleAttentionRepository(db);

	return {
		members,
		search,
		attention,
		memberDeps: { members },
		searchDeps: { search }
	};
}
