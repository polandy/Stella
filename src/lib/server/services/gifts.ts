import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { DEFAULT_LOCALE } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import { createDrizzleGiftGroupRepository } from '../db/gift-group-repository';
import { createDrizzleGiftRepository } from '../db/gift-repository';
import { createDrizzleHeldGiftRepository } from '../db/held-gift-repository';
import { createDrizzleImportantDateRepository } from '../db/important-date-repository';
import { createDrizzleCircleMembershipReads } from '../db/circle-membership-reads';
import { createDrizzleHomeReads } from '../db/home-repository';
import { createDrizzleKinshipGraphReads } from '../db/kinship-graph-read';
import type * as schema from '../db/schema';
import type { GiftGroupDeps } from '../domain/gifts/gift-groups';
import type { GiftDeps, GiftRepository } from '../domain/gifts/gifts';
import type { GroupShortcutDeps } from '../domain/gifts/group-shortcuts';
import { convertHeldGifts, type HeldGiftsReport } from '../domain/gifts/held-gifts';
import type { IdGenerator } from '../id';

/*
 * The `gifts` bounded context of the composition root (docs/dev/08 §8.3): the ideas, given and
 * received gifts kept on a person (docs/dev/02 §2.25). Built once per process by `createServices`;
 * the edge reads it off `locals.services.gifts`, and the story context reads its repository for
 * the given and received gifts it shows.
 *
 * A repository an edge — or another context — reads directly sits under its noun (`gifts`);
 * everything else is a use-case's `deps`, named after its type (`giftDeps` is a `GiftDeps`).
 */
export interface GiftServices {
	/** The one gift repository: the card, the use-cases and the story read it. */
	gifts: GiftRepository;
	giftDeps: GiftDeps;
	/** One idea for several people (§2.25.11), noted on `/gifts/several`. */
	giftGroupDeps: GiftGroupDeps;
	/** The family, homes and circles that form offers at one tap; read-only. */
	giftGroupShortcutDeps: GroupShortcutDeps;
	/**
	 * Makes gift records of the gifts still held as Monica notes or gift touchpoints (docs/dev/02
	 * §2.25.4); run at start and after a restore, writing what it did to the server log.
	 */
	convertHeldGifts: () => Promise<HeldGiftsReport>;
}

export interface GiftWiring {
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
	/** Whom a gift may be noted for; the people context owns the repository. */
	contacts: GiftDeps['contacts'];
}

export function createGiftServices({ db, clock, ids, contacts }: GiftWiring): GiftServices {
	const gifts = createDrizzleGiftRepository(db);
	return {
		gifts,
		giftDeps: { gifts, contacts, ids, clock },
		giftGroupDeps: {
			groups: createDrizzleGiftGroupRepository(db),
			gifts,
			contacts,
			birthYears: createDrizzleImportantDateRepository(db),
			ids,
			clock
		},
		giftGroupShortcutDeps: {
			kinship: createDrizzleKinshipGraphReads(db),
			homeReads: createDrizzleHomeReads(db),
			memberships: createDrizzleCircleMembershipReads(db)
		},
		convertHeldGifts: () =>
			convertHeldGifts({
				held: createDrizzleHeldGiftRepository(db),
				untitled: (locale) => createTranslator(locale ?? DEFAULT_LOCALE)('gifts.untitled'),
				log: (line) => console.info(line)
			})
	};
}
